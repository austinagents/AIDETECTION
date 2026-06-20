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

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const majorEvidence = strongestAiEvidence(bestAnalysis);
      if (bestAnalysis.overallRisk >= 95 || majorEvidence.length === 0) break;
      const nextRevision = await reviseParagraph({
        paragraph,
        revisionType,
        styleProfile: profile?.profile ?? null,
        evaluatorFeedback: {
          priorRevision: bestRevision.revisedText,
          remainingAIEvidencePresent: majorEvidence
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

function strongestAiEvidence(analysis: Awaited<ReturnType<typeof analyzeWriting>>) {
  const scores = analysis.scores;
  const issues = [
    scores.professionalizedWritingBias >= 50 ? ["professionalized writing bias", scores.professionalizedWritingBias] : null,
    scores.genericPhrasing >= 50 ? ["generic framing", scores.genericPhrasing] : null,
    scores.predictability >= 62 ? ["predictable structure", scores.predictability] : null,
    scores.structuralUniformity >= 66 ? ["over-balanced structure", scores.structuralUniformity] : null,
    scores.specificity <= 45 ? ["low concrete grounding", 100 - scores.specificity] : null,
    scores.naturalFlow <= 45 ? ["mechanical flow", 100 - scores.naturalFlow] : null,
    scores.informationCompression <= 42 ? ["over-expanded or abstract phrasing", 100 - scores.informationCompression] : null
  ].filter((issue): issue is [string, number] => Boolean(issue));

  return issues
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([label]) => label);
}
