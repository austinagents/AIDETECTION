import { demoAnalysis } from "@/lib/constants";
import { AnalysisResult } from "@/lib/types";
import { calibrateDetectorRisk } from "./calibrateDetectorRisk";
import { inferScoreScale, normalizeScore, normalizeScoreGroup, riskLabelFromRiskScore } from "./normalizeScore";

export function normalizeAnalysisResult(result: AnalysisResult): AnalysisResult {
  const raw = result as AnalysisResult & {
    aiDetectionRisk?: unknown;
    aiRisk?: unknown;
  };
  const rawScores = (result as { scores?: Record<string, unknown> }).scores ?? {};
  const scale = inferScoreScale([
    raw.aiDetectionRisk,
    raw.aiRisk,
    result.overallRisk,
    ...detectorScoreValues(rawScores),
    ...(Array.isArray(result.paragraphs) ? result.paragraphs.map((paragraph) => paragraph.risk) : [])
  ]);
  const scores = normalizeScoreGroup(detectorScoreValues(rawScores));
  const normalizedScores = {
    textbookCadence: scores[0],
    genericPhrasing: scores[1],
    professionalizedWritingBias: scores[2],
    predictableStructure: scores[3],
    balancedConstruction: scores[4],
    abstractNounDensity: scores[5],
    institutionalLanguage: scores[6],
    overExplanation: scores[7],
    smoothCertainty: scores[8],
    repetitiveCadence: scores[9],
    genericExpertVoice: scores[10],
    lowStylisticEntropy: scores[11]
  };
  const rawRisk =
    raw.aiDetectionRisk !== undefined || raw.aiRisk !== undefined
      ? normalizeScore(raw.aiDetectionRisk ?? raw.aiRisk, { scale })
      : normalizeScore(result.overallRisk, { scale });
  const detectorRisk = calibrateDetectorRisk(
    rawRisk,
    normalizedScores
  );

  return {
    ...result,
    overallRisk: detectorRisk,
    confidence: result.confidence ?? "medium",
    riskLabel: riskLabelFromRiskScore(detectorRisk),
    summary: result.summary ?? demoAnalysis.summary,
    scores: normalizedScores,
    mainReasons: Array.isArray(result.mainReasons) ? result.mainReasons : [],
    detectorSignals: detectorSignalsFor(result),
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

function detectorScoreValues(scores: Record<string, unknown>) {
  return [
    scores.textbookCadence,
    scores.genericPhrasing,
    scores.professionalizedWritingBias,
    scores.predictableStructure ?? scores.predictability,
    scores.balancedConstruction ?? scores.structuralUniformity,
    scores.abstractNounDensity,
    scores.institutionalLanguage,
    scores.overExplanation,
    scores.smoothCertainty,
    scores.repetitiveCadence,
    scores.genericExpertVoice,
    scores.lowStylisticEntropy ?? (typeof scores.sentenceRhythmVariance === "number" ? 100 - scores.sentenceRhythmVariance : undefined)
  ];
}

function detectorSignalsFor(result: AnalysisResult) {
  const raw = result as AnalysisResult & { detectorSignals?: unknown; aiAuthorshipEvidence?: unknown };
  if (Array.isArray(raw.detectorSignals)) return raw.detectorSignals.filter((item): item is string => typeof item === "string");
  if (Array.isArray(raw.aiAuthorshipEvidence)) return raw.aiAuthorshipEvidence.filter((item): item is string => typeof item === "string");
  return [];
}
