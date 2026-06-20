import { AnalysisScores } from "@/lib/types";
import { normalizeScore } from "./normalizeScore";

type CalibratedScores = Partial<AnalysisScores>;

export function calibrateAuthenticityScore(score: number, scores: CalibratedScores | undefined) {
  if (!scores) return normalizeScore(score);

  const current = normalizeScore(score);
  const professionalized = normalizeScore(scores.professionalizedWritingBias);
  const generic = normalizeScore(scores.genericPhrasing);
  const predictable = normalizeScore(scores.predictability);
  const uniform = normalizeScore(scores.structuralUniformity);
  const lowSpecificity = Math.max(0, 100 - normalizeScore(scores.specificity));
  const lowFlow = Math.max(0, 100 - normalizeScore(scores.naturalFlow));
  const lowCompression = Math.max(0, 100 - normalizeScore(scores.informationCompression));
  const lowRhythm = Math.max(0, 100 - normalizeScore(scores.sentenceRhythmVariance));

  const fingerprintStrength =
    professionalized * 0.28 +
    generic * 0.23 +
    predictable * 0.15 +
    uniform * 0.12 +
    lowSpecificity * 0.1 +
    lowFlow * 0.06 +
    lowCompression * 0.04 +
    lowRhythm * 0.02;

  const majorFingerprints = [
    professionalized >= 55,
    generic >= 55,
    predictable >= 65,
    uniform >= 70,
    lowSpecificity >= 55,
    lowFlow >= 55,
    lowCompression >= 60
  ].filter(Boolean).length;

  const evidenceBasedScore = normalizeScore(100 - fingerprintStrength);
  const naturalFloor = majorFingerprints === 0 ? 86 : majorFingerprints === 1 ? 78 : 0;

  return normalizeScore(Math.max(current, evidenceBasedScore, naturalFloor));
}
