import { NextResponse } from "next/server";
import { AppError, classifyStorageError, isAppError, publicError } from "@/lib/api/errors";
import { LOCAL_USER_ID } from "@/lib/constants";
import { analyzeWriting } from "@/lib/openai/analyzeWriting";
import { reviseParagraph, RevisionType } from "@/lib/openai/reviseParagraph";
import { formatScore } from "@/lib/scoring/normalizeScore";
import { getStorage } from "@/lib/storage";
import { ContentType, StyleProfile } from "@/lib/types";

const QUALITY_TARGET = 3;

type RevisionCandidate = {
  revision: Awaited<ReturnType<typeof reviseParagraph>>;
  analysis: Awaited<ReturnType<typeof analyzeWriting>>;
  validationFailures: string[];
  wordCount: number;
  qualityScore: number;
  requiredRepair: boolean;
};

export async function POST(request: Request) {
  let revisionDebug: Record<string, unknown> | null = null;
  try {
    const body = await request.json();
    const paragraph = String(body.currentParagraphText || body.paragraph || "");
    const revisionType: RevisionType = "improve";
    const analysisId = String(body.analysisId || "");
    const paragraphIndex = Number(body.paragraphIndex ?? 0);
    const beforeRiskDisplay = body.beforeRiskDisplay;
    const previousParagraphText = String(body.previousParagraphText || "");
    const nextParagraphText = String(body.nextParagraphText || "");
    const priorContextText = String(body.priorContextText || "");
    const detectorWindowText = [previousParagraphText, paragraph, nextParagraphText].filter((text) => text.trim()).join("\n\n");
    const subjectAnchors = extractSubjectAnchors(paragraph);
    const forbiddenContextAnchors = extractForbiddenContextAnchors(paragraph, previousParagraphText, nextParagraphText);

    if (!paragraph.trim()) throw new AppError("VALIDATION_ERROR", "Choose a paragraph to revise.", 400);
    if (typeof beforeRiskDisplay !== "number" || !Number.isFinite(beforeRiskDisplay)) {
      throw new AppError("VALIDATION_ERROR", "The displayed paragraph risk is required before revising.", 400);
    }

    const storage = getStorage();
    const profile = await storage.getStyleProfile(LOCAL_USER_ID).catch((error) => {
      throw classifyStorageError(error);
    });
    const sourceAnalysis = analysisId
      ? await storage.getAnalysis(LOCAL_USER_ID, analysisId).catch((error) => {
          throw classifyStorageError(error);
        })
      : null;
    const contentType = sourceAnalysis?.contentType ?? "Other";
    const beforeScore = beforeRiskDisplay;
    const originalWordCount = countWords(paragraph);
    const minWordCount = Math.ceil(originalWordCount * 0.95);
    const maxWordCount = Math.floor(originalWordCount * 1.3);
    revisionDebug = {
      paragraphIndex,
      originalWordCount,
      minWordCount,
      maxWordCount,
      analysisSkipped: false
    };
    let revision = await reviseParagraph({
      paragraph,
      revisionType,
      contentType,
      styleProfile: profile?.profile ?? null,
      previousParagraphText,
      nextParagraphText,
      priorContextText,
      detectorWindowText,
      subjectAnchors,
      forbiddenContextAnchors
    });
    let revisedWordCount = countWords(revision.revisedText);
    let validationFailures = getRevisionValidationFailures(
      revision.revisedText,
      revisedWordCount,
      minWordCount,
      maxWordCount,
      previousParagraphText,
      nextParagraphText,
      subjectAnchors,
      forbiddenContextAnchors
    );
    revisionDebug = {
      ...revisionDebug,
      subjectAnchors,
      forbiddenContextAnchors,
      firstRevisionWordCount: revisedWordCount,
      firstRevisionValidationErrors: validationFailures,
      firstRevisionBannedPatternMatches: getBannedRevisionMatches(revision.revisedText),
      callCount: 1
    };
    logRevisionDebug("first_revision", revisionDebug);

    const firstAnalysis = await analyzeRevisionWindow({
      previousParagraphText,
      revisedText: revision.revisedText,
      nextParagraphText,
      contentType,
      styleProfile: profile?.profile ?? null
    });
    let firstCandidate = makeCandidate(revision, firstAnalysis, validationFailures, revisedWordCount);
    revisionDebug = {
      ...revisionDebug,
      firstRevisionRisk: firstAnalysis.overallRisk,
      firstRevisionQualityScore: firstCandidate.qualityScore,
      callCount: 2
    };
    logRevisionDebug("first_analysis", revisionDebug);

    let candidates: RevisionCandidate[] = [firstCandidate];
    const needsRepair = firstCandidate.qualityScore > QUALITY_TARGET || firstCandidate.validationFailures.length > 0;

    if (needsRepair) {
      let repair = await reviseParagraph({
        paragraph,
        revisionType,
        contentType,
        styleProfile: profile?.profile ?? null,
        previousParagraphText,
        nextParagraphText,
        priorContextText,
        detectorWindowText,
        subjectAnchors,
        forbiddenContextAnchors,
        preserveWordCount: {
          originalWordCount,
          previousRevisedWordCount: revisedWordCount,
          minWordCount,
          maxWordCount
        },
        validationFeedback:
          buildRepairFeedback(firstCandidate, subjectAnchors, forbiddenContextAnchors)
      });
      revisedWordCount = countWords(repair.revisedText);
      validationFailures = getRevisionValidationFailures(
        repair.revisedText,
        revisedWordCount,
        minWordCount,
        maxWordCount,
        previousParagraphText,
        nextParagraphText,
        subjectAnchors,
        forbiddenContextAnchors
      );
      revisionDebug = {
        ...revisionDebug,
        repairRevisionWordCount: revisedWordCount,
        repairRevisionValidationErrors: validationFailures,
        repairRevisionBannedPatternMatches: getBannedRevisionMatches(repair.revisedText),
        callCount: 3
      };
      logRevisionDebug("repair_revision", revisionDebug);

      if (validationFailures.length) {
        revisionDebug = {
          ...revisionDebug,
          preNormalizationValidationErrors: validationFailures,
          preNormalizationWordCount: revisedWordCount,
          preNormalizationBannedPatternMatches: getBannedRevisionMatches(repair.revisedText)
        };
        repair = {
          ...repair,
          revisedText: normalizeRevisionText(repair.revisedText, minWordCount, maxWordCount)
        };
        revisedWordCount = countWords(repair.revisedText);
        validationFailures = getRevisionValidationFailures(
          repair.revisedText,
          revisedWordCount,
          minWordCount,
        maxWordCount,
        previousParagraphText,
        nextParagraphText,
        subjectAnchors,
        forbiddenContextAnchors
      );
        revisionDebug = {
          ...revisionDebug,
          normalizedRevisionWordCount: revisedWordCount,
          normalizedRevisionValidationErrors: validationFailures,
          normalizedRevisionBannedPatternMatches: getBannedRevisionMatches(repair.revisedText),
          analysisSkipped: false
        };
        logRevisionDebug("deterministic_normalization", revisionDebug);
      }

      const repairAnalysis = await analyzeRevisionWindow({
        previousParagraphText,
        revisedText: repair.revisedText,
        nextParagraphText,
        contentType,
        styleProfile: profile?.profile ?? null
      });
      const repairCandidate = makeCandidate(repair, repairAnalysis, validationFailures, revisedWordCount);
      candidates.push(repairCandidate);
      revisionDebug = {
        ...revisionDebug,
        repairRevisionRisk: repairAnalysis.overallRisk,
        repairRevisionQualityScore: repairCandidate.qualityScore,
        callCount: 4
      };
      logRevisionDebug("repair_analysis", revisionDebug);
    }

    const selected = selectBestCandidate(candidates);
    revision = {
      ...selected.revision,
      revisedText: normalizeRevisionText(selected.revision.revisedText, minWordCount, maxWordCount)
    };
    const revisedAnalysis = selected.analysis;
    const afterScore = revisedAnalysis.overallRisk;
    const improvement = Math.max(0, beforeScore - afterScore);
    revisionDebug = {
      ...revisionDebug,
      selectedQualityScore: selected.qualityScore,
      selectedValidationFailures: selected.validationFailures,
      selectedRisk: afterScore
    };
    logRevisionDebug("selected_revision", revisionDebug);

    if (analysisId) {
      await storage
        .createRevision({
          analysisId,
          paragraphIndex,
          originalText: paragraph,
          revisedText: revision.revisedText,
          revisionType
        })
        .catch((error) => {
          throw classifyStorageError(error);
        });
    }
    return NextResponse.json({
      ok: true,
      ...revision,
      status: "Ready",
      impact: {
        beforeRisk: beforeScore,
        afterRisk: afterScore,
        riskReduction: improvement,
        beforeScore,
        afterScore,
        improvement,
        improved: improvement > 0,
        label: improvement > 0 ? `${improvement} Risk Reduction` : "No risk reduction detected",
        summary: improvement > 0 ? `${formatScore(beforeScore)} to ${formatScore(afterScore)}` : formatScore(afterScore)
      },
      remainingIssues: strongestAiEvidence(revisedAnalysis).length ? strongestAiEvidence(revisedAnalysis) : revision.remainingIssues ?? []
    });
  } catch (error) {
    if (revisionDebug) {
      const response = publicError(isAppError(error) ? error : error);
      logRevisionDebug("request_failed", {
        ...revisionDebug,
        finalReturnedErrorMessage: response.body.error,
        finalReturnedErrorCode: response.body.code
      });
    }
    console.error("POST /api/revise failed", error);
    const response = publicError(isAppError(error) ? error : error);
    return NextResponse.json(response.body, { status: response.status });
  }
}

function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

async function analyzeRevisionWindow({
  previousParagraphText,
  revisedText,
  nextParagraphText,
  contentType,
  styleProfile
}: {
  previousParagraphText: string;
  revisedText: string;
  nextParagraphText: string;
  contentType: ContentType;
  styleProfile: StyleProfile | null;
}) {
  const revisedDetectorWindowText = [previousParagraphText, revisedText, nextParagraphText].filter((text) => text.trim()).join("\n\n");
  return analyzeWriting({
    title: "Revised detector window",
    content: revisedDetectorWindowText || revisedText,
    contentType,
    styleProfile
  });
}

function makeCandidate(
  revision: Awaited<ReturnType<typeof reviseParagraph>>,
  analysis: Awaited<ReturnType<typeof analyzeWriting>>,
  validationFailures: string[],
  wordCount: number
): RevisionCandidate {
  return {
    revision,
    analysis,
    validationFailures,
    wordCount,
    qualityScore: internalQualityScore(analysis.overallRisk, validationFailures),
    requiredRepair: validationFailures.length > 0
  };
}

function internalQualityScore(risk: number, validationFailures: string[]) {
  const severeFailures = validationFailures.filter((failure) =>
    /too short|too long|em dash|hyphenated|borrows neighboring|duplicates neighboring|drops current paragraph subject anchors/i.test(failure)
  );
  const validationPenalty = Math.min(4, severeFailures.length);
  return Math.max(1, Math.min(10, Math.ceil(risk / 34) + validationPenalty));
}

function selectBestCandidate(candidates: RevisionCandidate[]) {
  const validCandidates = candidates.filter((candidate) => candidate.validationFailures.length === 0);
  const pool = validCandidates.length ? validCandidates : candidates;
  return [...pool].sort((a, b) => {
    if (a.qualityScore !== b.qualityScore) return a.qualityScore - b.qualityScore;
    if (a.analysis.overallRisk !== b.analysis.overallRisk) return a.analysis.overallRisk - b.analysis.overallRisk;
    return b.wordCount - a.wordCount;
  })[0];
}

function buildRepairFeedback(candidate: RevisionCandidate, subjectAnchors: string[], forbiddenContextAnchors: string[]) {
  const issues = [
    ...candidate.validationFailures,
    ...strongestAiEvidence(candidate.analysis),
    candidate.qualityScore > QUALITY_TARGET ? `internal quality score is ${candidate.qualityScore}; target is ${QUALITY_TARGET}` : ""
  ].filter(Boolean);
  return [
    `Repair the revision. Remaining issues: ${issues.join(", ") || "repetitive structure and phrasing"}.`,
    "Do not rewrite from scratch unless necessary.",
    "Preserve the current paragraph subject, facts, examples, argument role, and meaning.",
    subjectAnchors.length ? `Preserve these current paragraph anchors: ${subjectAnchors.join(", ")}.` : "",
    forbiddenContextAnchors.length ? `Do not introduce these neighboring-context anchors: ${forbiddenContextAnchors.join(", ")}.` : "",
    "Use surrounding paragraphs only for continuity.",
    "Avoid forced conclusions, banned openings, banned endings, em dashes, and hyphenated compounds.",
    "Return the strongest valid revision you can produce."
  ].filter(Boolean).join(" ");
}

function normalizeRevisionText(text: string, minWordCount: number, maxWordCount: number) {
  const withoutBannedPunctuation = text
    .replace(/—/g, ", ")
    .replace(/\b([A-Za-z]+)-([A-Za-z]+)\b/g, "$1 $2")
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !containsRevisionMetaLanguage(sentence))
    .join(" ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();

  const words = withoutBannedPunctuation.split(/\s+/).filter(Boolean);
  if (words.length <= maxWordCount) return withoutBannedPunctuation;

  const trimmed = words.slice(0, maxWordCount).join(" ").replace(/[,:;]+$/, ".");
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function containsRevisionMetaLanguage(text: string) {
  return /\b(examples such as|remain part of the discussion|remains included|preserved in the revision|anchors?|subject matter preserved|this paragraph still discusses|the revision preserves|key examples remain|included naturally)\b/i.test(text);
}

const bannedRevisionPatterns = [
  {
    name: "em dash",
    pattern: /—/
  },
  {
    name: "hyphenated compound",
    pattern: /\b[A-Za-z]+-[A-Za-z]+\b/
  }
];

function getBannedRevisionViolations(text: string) {
  return bannedRevisionPatterns.filter(({ pattern }) => pattern.test(text));
}

function getBannedRevisionMatches(text: string) {
  return bannedRevisionPatterns.flatMap(({ name, pattern }) => {
    const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
    const globalPattern = new RegExp(pattern.source, flags);
    const matches = Array.from(text.matchAll(globalPattern)).map((match) => match[0]);
    return matches.length ? [{ name, matches }] : [];
  });
}

function getRevisionValidationFailures(
  text: string,
  wordCount: number,
  minWordCount: number,
  maxWordCount: number,
  previousParagraphText = "",
  nextParagraphText = "",
  subjectAnchors: string[] = [],
  forbiddenContextAnchors: string[] = []
) {
  const failures: string[] = [];
  if (wordCount < minWordCount) failures.push("is too short");
  if (wordCount > maxWordCount) failures.push("is too long");
  for (const violation of getBannedRevisionViolations(text)) {
    failures.push(`contains ${violation.name}`);
  }
  if (hasRepeatedOpening(text, previousParagraphText)) failures.push("repeats the previous paragraph opening rhythm");
  if (hasRepeatedEnding(text, previousParagraphText)) failures.push("repeats the previous paragraph ending rhythm");
  if (hasBannedOpening(text)) failures.push("uses a repetitive educational opening");
  if (hasBannedEnding(text)) failures.push("uses a repetitive significance ending");
  if (hasForcedConclusion(text)) failures.push("uses a forced conclusion");
  if (!hasVariedSentenceRhythm(text)) failures.push("has repetitive sentence rhythm");
  if (hasDuplicateNeighborContent(text, previousParagraphText, nextParagraphText)) failures.push("duplicates neighboring paragraph content");
  if (hasRepeatedParagraphArchitecture(text, previousParagraphText)) failures.push("repeats neighboring paragraph architecture");
  const missingAnchors = getMissingSubjectAnchors(text, subjectAnchors);
  if (missingAnchors.length) failures.push(`drops current paragraph subject anchors: ${missingAnchors.join(", ")}`);
  const contextBleed = getContextBleedAnchors(text, forbiddenContextAnchors);
  if (contextBleed.length) failures.push(`borrows neighboring paragraph content: ${contextBleed.join(", ")}`);
  return failures;
}

function hasRepeatedOpening(text: string, previousParagraphText: string) {
  const current = phraseSignature(firstSentence(text));
  const previous = phraseSignature(firstSentence(previousParagraphText));
  return Boolean(current && previous && current === previous);
}

function hasRepeatedEnding(text: string, previousParagraphText: string) {
  const current = phraseSignature(lastSentence(text));
  const previous = phraseSignature(lastSentence(previousParagraphText));
  return Boolean(current && previous && current === previous);
}

function firstSentence(text: string) {
  return text.split(/[.!?]+/).map((item) => item.trim()).filter(Boolean)[0] ?? "";
}

function lastSentence(text: string) {
  const sentences = text.split(/[.!?]+/).map((item) => item.trim()).filter(Boolean);
  return sentences[sentences.length - 1] ?? "";
}

function phraseSignature(sentence: string) {
  return sentence.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(Boolean).slice(0, 3).join(" ");
}

function hasBannedOpening(text: string) {
  const opening = firstSentence(text).toLowerCase();
  return bannedOpenings.some((pattern) => pattern.test(opening));
}

function hasBannedEnding(text: string) {
  const ending = lastSentence(text).toLowerCase();
  return bannedEndings.some((pattern) => pattern.test(ending));
}

function hasForcedConclusion(text: string) {
  const ending = lastSentence(text).toLowerCase();
  return /\b(this|these|such)\b/.test(ending) && /\b(demonstrates|reveals|highlights|reflects|illustrates|shows|suggests|underscores)\b/.test(ending);
}

function hasVariedSentenceRhythm(text: string) {
  const lengths = sentenceWordCounts(text);
  if (lengths.length < 3) return true;
  const uniqueBuckets = new Set(lengths.map(sentenceLengthBucket));
  const average = lengths.reduce((sum, length) => sum + length, 0) / lengths.length;
  const variance = lengths.reduce((sum, length) => sum + Math.pow(length - average, 2), 0) / lengths.length;
  return uniqueBuckets.size >= 2 && Math.sqrt(variance) >= 4;
}

function hasDuplicateNeighborContent(text: string, previousParagraphText: string, nextParagraphText: string) {
  const currentSignatures = sentenceSignatures(text);
  if (!currentSignatures.length) return false;
  const neighborSignatures = new Set([
    ...sentenceSignatures(previousParagraphText),
    ...sentenceSignatures(nextParagraphText)
  ]);
  return currentSignatures.some((signature) => neighborSignatures.has(signature));
}

function hasRepeatedParagraphArchitecture(text: string, previousParagraphText: string) {
  if (!previousParagraphText.trim()) return false;
  return paragraphArchitecture(text) === paragraphArchitecture(previousParagraphText);
}

function sentenceWordCounts(text: string) {
  return text.split(/[.!?]+/).map((item) => item.trim()).filter(Boolean).map((sentence) => sentence.split(/\s+/).filter(Boolean).length);
}

function sentenceLengthBucket(length: number) {
  if (length <= 10) return "short";
  if (length <= 22) return "medium";
  return "long";
}

function sentenceSignatures(text: string) {
  return text.split(/[.!?]+/)
    .map((item) => normalizeComparableText(item).split(/\s+/).filter((word) => word.length > 4 && !commonWords.has(word)).slice(0, 8).join(" "))
    .filter((signature) => signature.split(/\s+/).length >= 5);
}

function paragraphArchitecture(text: string) {
  const opening = classifySentence(firstSentence(text));
  const ending = classifySentence(lastSentence(text));
  const lengths = sentenceWordCounts(text).map(sentenceLengthBucket).join("-");
  return `${opening}:${ending}:${lengths}`;
}

function classifySentence(sentence: string) {
  const normalized = sentence.toLowerCase();
  if (/\b(for example|such as|including|like)\b/.test(normalized)) return "example";
  if (/\b(because|therefore|as a result|consequently|so)\b/.test(normalized)) return "cause";
  if (/\b(however|but|rather|although|while)\b/.test(normalized)) return "contrast";
  if (/\?/.test(sentence)) return "question";
  if (/\b(demonstrates|reveals|highlights|reflects|illustrates|shows|suggests)\b/.test(normalized)) return "significance";
  return "claim";
}

function extractSubjectAnchors(text: string) {
  const anchors = [
    ...extractNamedEntities(text),
    ...extractListAnchors(text),
    ...extractRareTopicWords(text)
  ];
  return uniqueAnchors(anchors).slice(0, 14);
}

function extractForbiddenContextAnchors(currentText: string, previousParagraphText: string, nextParagraphText: string) {
  const currentAnchors = new Set(extractSubjectAnchors(currentText).map(normalizeAnchor));
  const contextAnchors = [
    ...extractNamedEntities(previousParagraphText),
    ...extractNamedEntities(nextParagraphText)
  ];
  return uniqueAnchors(contextAnchors)
    .filter((anchor) => !currentAnchors.has(normalizeAnchor(anchor)))
    .slice(0, 18);
}

function getMissingSubjectAnchors(text: string, subjectAnchors: string[]) {
  const normalizedText = normalizeComparableText(text);
  const requiredAnchors = subjectAnchors.filter((anchor) => isRequiredSubjectAnchor(anchor, subjectAnchors.length));
  return requiredAnchors.filter((anchor) => !normalizedText.includes(normalizeComparableText(anchor))).slice(0, 5);
}

function getContextBleedAnchors(text: string, forbiddenContextAnchors: string[]) {
  const normalizedText = normalizeComparableText(text);
  return forbiddenContextAnchors
    .filter((anchor) => isSpecificContextAnchor(anchor))
    .filter((anchor) => normalizedText.includes(normalizeComparableText(anchor)))
    .slice(0, 6);
}

function extractNamedEntities(text: string) {
  const matches = Array.from(text.matchAll(/\b(?:[A-Z][a-zA-Z'’]+(?:\s+(?:of|the|and|in|[A-Z][a-zA-Z'’]+)){0,3})\b/g));
  return matches
    .map((match) => ({ value: match[0].trim(), index: match.index ?? 0 }))
    .filter(({ value, index }) => {
      const isSingleWord = !/\s/.test(value);
      const sentenceStart = index === 0 || /[.!?]\s*$/.test(text.slice(Math.max(0, index - 3), index));
      return !(isSingleWord && sentenceStart);
    })
    .map(({ value }) => value)
    .filter((match) => !sentenceStarterWords.has(match.toLowerCase()))
    .filter((match) => match.length > 2);
}

function extractRareTopicWords(text: string) {
  const words = text.match(/\b[A-Za-z][A-Za-z'’]{5,}\b/g) ?? [];
  return words
    .map((word) => word.replace(/[’']/g, "").toLowerCase())
    .filter((word) => !commonWords.has(word))
    .filter((word, index, list) => list.indexOf(word) === index)
    .slice(0, 10);
}

function extractListAnchors(text: string) {
  const listMatches = text.match(/\b[A-Za-z][A-Za-z'’]*(?:\s+[A-Za-z][A-Za-z'’]*){0,2}(?=,|\s+and\s+|\s+or\s+)/g) ?? [];
  const finalItems = Array.from(text.matchAll(/\b(?:and|or)\s+([A-Za-z][A-Za-z'’]*(?:\s+[A-Za-z][A-Za-z'’]*){1})\s+(?=all\b|both\b|can\b|could\b|may\b|might\b|often\b|provide\b|serve\b|shape\b|help\b|offer\b)/g))
    .map((match) => match[1]);
  return [...listMatches, ...finalItems]
    .map((item) => item.replace(/\s+(all|both)$/i, "").trim())
    .filter((item) => item.split(/\s+/).length >= 2)
    .filter((item) => !/^(a|an|and|before|from|in|of|or|that|the|these|those|this|to|with|such|while)\b/i.test(item))
    .filter((item) => !/\b(all|both|can|came|could|forms|may|might|provide|themselves|they|who)\b/i.test(item))
    .filter((item) => item.length <= 40)
    .slice(0, 8);
}

function uniqueAnchors(anchors: string[]) {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const anchor of anchors) {
    const normalized = normalizeAnchor(anchor);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    unique.push(anchor);
  }
  return unique;
}

function isRequiredSubjectAnchor(anchor: string, totalAnchors: number) {
  return /[A-Z]/.test(anchor[0] ?? "") || anchor.includes(" ") || totalAnchors <= 5;
}

function isSpecificContextAnchor(anchor: string) {
  const normalized = normalizeAnchor(anchor);
  return anchor.includes(" ") || /^[A-Z]/.test(anchor) || normalized.length >= 8;
}

function normalizeAnchor(anchor: string) {
  return normalizeComparableText(anchor);
}

function normalizeComparableText(text: string) {
  return text.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

const sentenceStarterWords = new Set([
  "a",
  "an",
  "as",
  "at",
  "because",
  "before",
  "but",
  "during",
  "early",
  "for",
  "from",
  "human",
  "if",
  "in",
  "it",
  "long",
  "many",
  "one",
  "rather",
  "similar",
  "some",
  "such",
  "the",
  "these",
  "this",
  "through",
  "when",
  "while",
  "without"
]);

const commonWords = new Set([
  "about",
  "across",
  "around",
  "because",
  "before",
  "between",
  "common",
  "could",
  "different",
  "during",
  "example",
  "explain",
  "explained",
  "explaining",
  "formed",
  "helped",
  "however",
  "important",
  "including",
  "itself",
  "larger",
  "meaning",
  "modern",
  "natural",
  "people",
  "rather",
  "shared",
  "similar",
  "stories",
  "through",
  "understand",
  "within",
  "without",
  "world"
]);

const bannedOpenings = [
  /^to understand\b/,
  /^throughout history\b/,
  /^many scholars\b/,
  /^anthropologists argue\b/,
  /^mythology is\b/,
  /^one of the oldest\b/,
  /^one of humanity/,
  /^across cultures\b/,
  /^since ancient times\b/
];

const bannedEndings = [
  /^this demonstrates\b/,
  /^this reveals\b/,
  /^this highlights\b/,
  /^this reflects\b/,
  /^this illustrates\b/,
  /^this ultimately shows\b/,
  /^this became\b/,
  /^this laid the foundation for\b/,
  /\bthis demonstrates\b/,
  /\bthis reveals\b/,
  /\bthis highlights\b/,
  /\bthis reflects\b/,
  /\bthis illustrates\b/,
  /\bthis ultimately shows\b/
];

function logRevisionDebug(event: string, details: Record<string, unknown> | null) {
  console.info("[revision-debug]", JSON.stringify({ event, ...details }));
}

function strongestAiEvidence(analysis: Awaited<ReturnType<typeof analyzeWriting>>) {
  const scores = analysis.scores;
  const issues = [
    scores.professionalizedWritingBias >= 50 ? ["professionalized writing bias", scores.professionalizedWritingBias] : null,
    scores.genericPhrasing >= 50 ? ["generic framing", scores.genericPhrasing] : null,
    scores.predictableStructure >= 62 ? ["predictable structure", scores.predictableStructure] : null,
    scores.balancedConstruction >= 66 ? ["over-balanced structure", scores.balancedConstruction] : null,
    scores.textbookCadence >= 55 ? ["textbook cadence", scores.textbookCadence] : null,
    scores.abstractNounDensity >= 55 ? ["abstract noun density", scores.abstractNounDensity] : null,
    scores.institutionalLanguage >= 55 ? ["institutional language", scores.institutionalLanguage] : null,
    scores.overExplanation >= 55 ? ["over-explanation", scores.overExplanation] : null,
    scores.smoothCertainty >= 55 ? ["smooth certainty", scores.smoothCertainty] : null,
    scores.repetitiveCadence >= 55 ? ["repetitive cadence", scores.repetitiveCadence] : null,
    scores.genericExpertVoice >= 55 ? ["generic expert voice", scores.genericExpertVoice] : null
  ].filter((issue): issue is [string, number] => Boolean(issue));

  const legacy = analysis as typeof analysis & { aiAuthorshipEvidence?: string[] };
  const modelIssues = (analysis.detectorSignals ?? legacy.aiAuthorshipEvidence ?? []).flatMap((issue) => {
    const lower = issue.toLowerCase();
    return [
      lower.includes("textbook") || lower.includes("cadence") ? "textbook cadence" : null,
      lower.includes("template") || lower.includes("predictable") ? "predictable essay-template structure" : null,
      lower.includes("abstract") || lower.includes("concept") ? "abstract concept density" : null,
      lower.includes("professional") || lower.includes("institutional") ? "professionalized writing bias" : null,
      lower.includes("generic") || lower.includes("broad") ? "generic framing" : null,
      lower.includes("balanced") ? "over-balanced structure" : null
    ].filter((item): item is string => Boolean(item));
  });

  return Array.from(new Set([
    ...issues
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
      .map(([label]) => label),
    ...modelIssues
  ])).slice(0, 5);
}
