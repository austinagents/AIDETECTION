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
    const revisionType = (body.revisionType || "improve") as RevisionType;
    const analysisId = String(body.analysisId || "");
    const paragraphIndex = Number(body.paragraphIndex ?? 0);

    if (!paragraph.trim()) throw new AppError("VALIDATION_ERROR", "Choose a paragraph to revise.", 400);

    const storage = getStorage();
    const profile = await storage.getStyleProfile(LOCAL_USER_ID).catch((error) => {
      throw classifyStorageError(error);
    });
    const originalAnalysis = await analyzeWriting({
      title: "Original paragraph",
      content: paragraph,
      contentType: "Other",
      styleProfile: profile?.profile ?? null
    });
    const beforeScore = originalAnalysis.overallRisk;
    let bestRevision = await reviseParagraph({ paragraph, revisionType, styleProfile: profile?.profile ?? null });
    let bestAnalysis = await analyzeWriting({
      title: "Revised paragraph",
      content: bestRevision.revisedText,
      contentType: "Other",
      styleProfile: profile?.profile ?? null
    });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (bestAnalysis.overallRisk >= Math.min(95, beforeScore + 12)) break;
      const nextRevision = await reviseParagraph({
        paragraph,
        revisionType,
        styleProfile: profile?.profile ?? null,
        evaluatorFeedback: {
          priorRevision: bestRevision.revisedText,
          remainingHumanEvidenceMissing: weakestHumanEvidence(bestAnalysis),
          remainingAIEvidencePresent: strongestAiEvidence(bestAnalysis)
        }
      });
      const nextAnalysis = await analyzeWriting({
        title: "Revised paragraph",
        content: nextRevision.revisedText,
        contentType: "Other",
        styleProfile: profile?.profile ?? null
      });
      if (nextAnalysis.overallRisk > bestAnalysis.overallRisk) {
        bestRevision = nextRevision;
        bestAnalysis = nextAnalysis;
      }
    }

    const revision = bestRevision;
    const revisedAnalysis = bestAnalysis;
    const afterScore = revisedAnalysis.overallRisk;
    const improvement = Math.max(0, afterScore - beforeScore);

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
        beforeScore,
        afterScore,
        improvement,
        improved: improvement > 0,
        label: improvement > 0 ? `+${improvement} Improvement` : "No improvement detected",
        summary: improvement > 0 ? `${formatScore(beforeScore)} to ${formatScore(afterScore)}` : formatScore(afterScore)
      },
      remainingIssues: revision.remainingIssues?.length ? revision.remainingIssues : strongestAiEvidence(revisedAnalysis)
    });
  } catch (error) {
    console.error("POST /api/revise failed", error);
    const response = publicError(isAppError(error) ? error : error);
    return NextResponse.json(response.body, { status: response.status });
  }
}

function weakestHumanEvidence(analysis: Awaited<ReturnType<typeof analyzeWriting>>) {
  const scores = analysis.scores;
  return [
    ["authorial judgment", scores.authorialJudgment],
    ["specificity", scores.specificity],
    ["information hierarchy", scores.informationHierarchy],
    ["information compression", scores.informationCompression],
    ["surprise / contrast", scores.surpriseContrast],
    ["sentence variation", scores.sentenceRhythmVariance],
    ["natural flow", scores.naturalFlow]
  ]
    .filter(([, score]) => Number(score) < 70)
    .sort((a, b) => Number(a[1]) - Number(b[1]))
    .slice(0, 4)
    .map(([label]) => String(label));
}

function strongestAiEvidence(analysis: Awaited<ReturnType<typeof analyzeWriting>>) {
  const scores = analysis.scores;
  return [
    ["generic framing", scores.genericPhrasing],
    ["predictable structure", scores.predictability],
    ["over-balanced structure", scores.structuralUniformity],
    ["low specificity", 100 - scores.specificity],
    ["flat summary tone", 100 - scores.naturalFlow],
    ["low information compression", 100 - scores.informationCompression],
    ["low surprise / contrast", 100 - scores.surpriseContrast]
  ]
    .filter(([, score]) => Number(score) >= 35)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, 4)
    .map(([label]) => String(label));
}
