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
    const paragraph = String(body.paragraph || "");
    const revisionType: RevisionType = "improve";
    const analysisId = String(body.analysisId || "");
    const paragraphIndex = Number(body.paragraphIndex ?? 0);
    const beforeRiskDisplay = body.beforeRiskDisplay;

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
    let revision = await reviseParagraph({ paragraph, revisionType, contentType, styleProfile: profile?.profile ?? null });
    let revisedWordCount = countWords(revision.revisedText);
    let validationFailures = getRevisionValidationFailures(revision.revisedText, revisedWordCount, minWordCount, maxWordCount);
    revisionDebug = {
      ...revisionDebug,
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
        preserveWordCount: {
          originalWordCount,
          previousRevisedWordCount: revisedWordCount,
          minWordCount,
          maxWordCount
        },
        validationFeedback:
          `Repair the revision. Validation failed because it ${validationFailures.join(", ")}. Rewrite again while preserving all meaning, staying within the word count range, and avoiding banned punctuation.`
      });
      revisedWordCount = countWords(revision.revisedText);
      validationFailures = getRevisionValidationFailures(revision.revisedText, revisedWordCount, minWordCount, maxWordCount);
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
      validationFailures = getRevisionValidationFailures(revision.revisedText, revisedWordCount, minWordCount, maxWordCount);
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
    const revisedAnalysis = await analyzeWriting({
      title: "Revised paragraph",
      content: revision.revisedText,
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

function getRevisionValidationFailures(text: string, wordCount: number, minWordCount: number, maxWordCount: number) {
  const failures: string[] = [];
  if (wordCount < minWordCount) failures.push("is too short");
  if (wordCount > maxWordCount) failures.push("is too long");
  for (const violation of getBannedRevisionViolations(text)) {
    failures.push(`contains ${violation.name}`);
  }
  return failures;
}

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
