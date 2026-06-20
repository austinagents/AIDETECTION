import { NextResponse } from "next/server";
import { AppError, classifyStorageError, isAppError, publicError } from "@/lib/api/errors";
import { LOCAL_USER_ID } from "@/lib/constants";
import { analyzeWriting } from "@/lib/openai/analyzeWriting";
import { reviseParagraph, RevisionType } from "@/lib/openai/reviseParagraph";
import { formatScore } from "@/lib/scoring/normalizeScore";
import { getStorage } from "@/lib/storage";

export async function POST(request: Request) {
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
    let revision = await reviseParagraph({ paragraph, revisionType, contentType, styleProfile: profile?.profile ?? null });
    let revisedWordCount = countWords(revision.revisedText);

    if (!isWithinRevisionWordRange(revisedWordCount, minWordCount, maxWordCount)) {
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
        }
      });
      revisedWordCount = countWords(revision.revisedText);
    }

    if (!isWithinRevisionWordRange(revisedWordCount, minWordCount, maxWordCount)) {
      throw new AppError(
        "VALIDATION_ERROR",
        "The revised paragraph changed length too much, so it was blocked. Try improving it again.",
        422
      );
    }

    if (getBannedRevisionViolations(revision.revisedText).length) {
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
          "Rewrite again. Do not use em dashes or hyphenated word compounds. Replace hyphenated compounds with normal phrasing."
      });
      revisedWordCount = countWords(revision.revisedText);
    }

    if (getBannedRevisionViolations(revision.revisedText).length) {
      throw new Error("BANNED_PUNCTUATION_VALIDATION_ERROR");
    }

    if (!isWithinRevisionWordRange(revisedWordCount, minWordCount, maxWordCount)) {
      throw new AppError(
        "VALIDATION_ERROR",
        "The revised paragraph changed length too much, so it was blocked. Try improving it again.",
        422
      );
    }

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
