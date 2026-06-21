import { NextResponse } from "next/server";
import { AppError, classifyStorageError, isAppError, publicError } from "@/lib/api/errors";
import { LOCAL_USER_ID } from "@/lib/constants";
import { analyzeWriting } from "@/lib/openai/analyzeWriting";
import { reviseParagraph, RevisionType } from "@/lib/openai/reviseParagraph";
import { formatScore } from "@/lib/scoring/normalizeScore";
import { getStorage } from "@/lib/storage";

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
      subjectAnchors,
      forbiddenContextAnchors
    );
    revisionDebug = {
      ...revisionDebug,
      subjectAnchors,
      forbiddenContextAnchors,
      firstRevisionWordCount: revisedWordCount,
      firstRevisionValidationErrors: validationFailures,
      firstRevisionBannedPatternMatches: getBannedRevisionMatches(revision.revisedText)
    };
    logRevisionDebug("first_revision", revisionDebug);

    if (validationFailures.length) {
      revision = await reviseParagraph({
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
          `Repair the revision. Validation failed because it ${validationFailures.join(", ")}. Rewrite again while preserving all meaning, staying within the word count range, avoiding banned punctuation, preserving the current paragraph subject anchors, and using surrounding paragraphs only for flow.`
      });
      revisedWordCount = countWords(revision.revisedText);
      validationFailures = getRevisionValidationFailures(
        revision.revisedText,
        revisedWordCount,
        minWordCount,
        maxWordCount,
        previousParagraphText,
        subjectAnchors,
        forbiddenContextAnchors
      );
      revisionDebug = {
        ...revisionDebug,
        repairRevisionWordCount: revisedWordCount,
        repairRevisionValidationErrors: validationFailures,
        repairRevisionBannedPatternMatches: getBannedRevisionMatches(revision.revisedText)
      };
      logRevisionDebug("repair_revision", revisionDebug);
    }

    if (validationFailures.length) {
      revisionDebug = {
        ...revisionDebug,
        preNormalizationValidationErrors: validationFailures,
        preNormalizationWordCount: revisedWordCount,
        preNormalizationBannedPatternMatches: getBannedRevisionMatches(revision.revisedText)
      };
      revision = {
        ...revision,
        revisedText: normalizeRevisionText(revision.revisedText, minWordCount, maxWordCount)
      };
      revisedWordCount = countWords(revision.revisedText);
      validationFailures = getRevisionValidationFailures(
        revision.revisedText,
        revisedWordCount,
        minWordCount,
        maxWordCount,
        previousParagraphText,
        subjectAnchors,
        forbiddenContextAnchors
      );
      revisionDebug = {
        ...revisionDebug,
        normalizedRevisionWordCount: revisedWordCount,
        normalizedRevisionValidationErrors: validationFailures,
        normalizedRevisionBannedPatternMatches: getBannedRevisionMatches(revision.revisedText),
        analysisSkipped: false
      };
      logRevisionDebug("deterministic_normalization", revisionDebug);
    }

    logRevisionDebug("analysis_started", revisionDebug);
    const revisedDetectorWindowText = [previousParagraphText, revision.revisedText, nextParagraphText].filter((text) => text.trim()).join("\n\n");
    const revisedAnalysis = await analyzeWriting({
      title: "Revised detector window",
      content: revisedDetectorWindowText || revision.revisedText,
      contentType,
      styleProfile: profile?.profile ?? null
    });
    const afterScore = revisedAnalysis.overallRisk;
    const improvement = Math.max(0, beforeScore - afterScore);

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

function isWithinRevisionWordRange(wordCount: number, minWordCount: number, maxWordCount: number) {
  return wordCount >= minWordCount && wordCount <= maxWordCount;
}

function normalizeRevisionText(text: string, minWordCount: number, maxWordCount: number) {
  const withoutBannedPunctuation = text
    .replace(/—/g, ", ")
    .replace(/\b([A-Za-z]+)-([A-Za-z]+)\b/g, "$1 $2")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();

  const words = withoutBannedPunctuation.split(/\s+/).filter(Boolean);
  if (words.length <= maxWordCount) return withoutBannedPunctuation;

  const trimmed = words.slice(0, maxWordCount).join(" ").replace(/[,:;]+$/, ".");
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
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

function extractSubjectAnchors(text: string) {
  const anchors = [
    ...extractNamedEntities(text),
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
  const matches = text.match(/\b(?:[A-Z][a-zA-Z'’]+(?:\s+(?:of|the|and|in|[A-Z][a-zA-Z'’]+)){0,3})\b/g) ?? [];
  return matches
    .map((match) => match.trim())
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
  "for",
  "from",
  "if",
  "in",
  "it",
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
