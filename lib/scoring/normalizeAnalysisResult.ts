import { demoAnalysis } from "@/lib/constants";
import { AnalysisResult } from "@/lib/types";
import { inferScoreScale, normalizeScore, normalizeScoreGroup, riskLabelFromAuthenticityScore, riskLabelFromRiskScore } from "./normalizeScore";

export function normalizeAnalysisResult(result: AnalysisResult): AnalysisResult {
  const raw = result as AnalysisResult & {
    authenticityScore?: unknown;
    overallAuthenticity?: unknown;
    authenticity?: unknown;
  };
  const scale = inferScoreScale([
    raw.authenticityScore,
    raw.overallAuthenticity,
    raw.authenticity,
    result.overallRisk,
    result.scores?.predictability,
    result.scores?.structuralUniformity,
    result.scores?.genericPhrasing,
    result.scores?.specificity,
    result.scores?.personalVoice,
    result.scores?.emotionalTexture,
    result.scores?.vocabularyNaturalness,
    result.scores?.sentenceRhythmVariance,
    ...(Array.isArray(result.paragraphs) ? result.paragraphs.map((paragraph) => paragraph.risk) : [])
  ]);
  const authenticityScore = normalizeScore(raw.authenticityScore ?? raw.overallAuthenticity ?? raw.authenticity ?? result.overallRisk, { scale });
  const scores = normalizeScoreGroup([
    result.scores?.predictability,
    result.scores?.structuralUniformity,
    result.scores?.genericPhrasing,
    result.scores?.specificity,
    result.scores?.personalVoice,
    result.scores?.emotionalTexture,
    result.scores?.vocabularyNaturalness,
    result.scores?.sentenceRhythmVariance
  ]);

  return {
    ...result,
    overallRisk: authenticityScore,
    confidence: result.confidence ?? "medium",
    riskLabel: riskLabelFromAuthenticityScore(authenticityScore),
    summary: result.summary ?? demoAnalysis.summary,
    scores: {
      predictability: scores[0],
      structuralUniformity: scores[1],
      genericPhrasing: scores[2],
      specificity: scores[3],
      personalVoice: scores[4],
      emotionalTexture: scores[5],
      vocabularyNaturalness: scores[6],
      sentenceRhythmVariance: scores[7]
    },
    mainReasons: Array.isArray(result.mainReasons) ? result.mainReasons : [],
    paragraphs: Array.isArray(result.paragraphs)
      ? result.paragraphs.map((paragraph, index) => {
          const risk = normalizeScore(paragraph.risk, { scale });
          return {
            ...paragraph,
            index: paragraph.index ?? index,
            risk,
            riskLabel: riskLabelFromRiskScore(risk)
          };
        })
      : [],
    revisionStrategy: Array.isArray(result.revisionStrategy) ? result.revisionStrategy : [],
    styleAlignedSuggestions: Array.isArray(result.styleAlignedSuggestions) ? result.styleAlignedSuggestions : []
  };
}
