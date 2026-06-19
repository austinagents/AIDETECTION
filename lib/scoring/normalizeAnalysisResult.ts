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
    result.scores?.authorialJudgment,
    result.scores?.predictability,
    result.scores?.structuralUniformity,
    result.scores?.genericPhrasing,
    result.scores?.specificity,
    result.scores?.informationHierarchy,
    result.scores?.personalVoice,
    result.scores?.voiceOwnership,
    result.scores?.informationCompression,
    result.scores?.surpriseContrast,
    result.scores?.naturalFlow,
    result.scores?.emotionalTexture,
    result.scores?.vocabularyNaturalness,
    result.scores?.sentenceRhythmVariance,
    ...(Array.isArray(result.paragraphs) ? result.paragraphs.map((paragraph) => paragraph.risk) : [])
  ]);
  const authenticityScore = normalizeScore(raw.authenticityScore ?? raw.overallAuthenticity ?? raw.authenticity ?? result.overallRisk, { scale });
  const scores = normalizeScoreGroup([
    result.scores?.authorialJudgment,
    result.scores?.predictability,
    result.scores?.structuralUniformity,
    result.scores?.genericPhrasing,
    result.scores?.specificity,
    result.scores?.informationHierarchy,
    result.scores?.personalVoice,
    result.scores?.voiceOwnership,
    result.scores?.informationCompression,
    result.scores?.surpriseContrast,
    result.scores?.naturalFlow,
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
      authorialJudgment: scores[0],
      predictability: scores[1],
      structuralUniformity: scores[2],
      genericPhrasing: scores[3],
      specificity: scores[4],
      informationHierarchy: scores[5],
      personalVoice: scores[6],
      voiceOwnership: scores[7],
      informationCompression: scores[8],
      surpriseContrast: scores[9],
      naturalFlow: scores[10],
      emotionalTexture: scores[11],
      vocabularyNaturalness: scores[12],
      sentenceRhythmVariance: scores[13]
    },
    mainReasons: Array.isArray(result.mainReasons) ? result.mainReasons : [],
    humanAuthorshipEvidence: Array.isArray(result.humanAuthorshipEvidence) ? result.humanAuthorshipEvidence : [],
    aiAuthorshipEvidence: Array.isArray(result.aiAuthorshipEvidence) ? result.aiAuthorshipEvidence : [],
    documentEvidence: Array.isArray(result.documentEvidence) ? result.documentEvidence : [],
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
