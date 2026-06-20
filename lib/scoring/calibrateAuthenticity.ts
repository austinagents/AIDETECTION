import { AnalysisScores } from "@/lib/types";
import { normalizeScore } from "./normalizeScore";

type CalibratedScores = Partial<AnalysisScores>;

export function calibrateAuthenticityScore(score: number, scores: CalibratedScores | undefined, text?: string) {
  if (!scores) return normalizeScore(score);

  const current = normalizeScore(score);
  const professionalized = normalizeScore(scores.professionalizedWritingBias);
  const generic = normalizeScore(scores.genericPhrasing);
  const predictable = normalizeScore(scores.predictability);
  const uniform = normalizeScore(scores.structuralUniformity);
  const lowSpecificity = Math.max(0, 70 - normalizeScore(scores.specificity));
  const lowFlow = Math.max(0, 100 - normalizeScore(scores.naturalFlow));
  const lowCompression = Math.max(0, 85 - normalizeScore(scores.informationCompression));
  const lowRhythm = Math.max(0, 100 - normalizeScore(scores.sentenceRhythmVariance));
  const textFingerprints = text ? detectTextFingerprints(text) : null;

  const fingerprintStrength =
    professionalized * 0.3 +
    generic * 0.22 +
    predictable * 0.18 +
    uniform * 0.14 +
    lowSpecificity * 0.03 +
    lowFlow * 0.05 +
    lowCompression * 0.03 +
    lowRhythm * 0.03 +
    (textFingerprints?.score ?? 0) * 0.32;

  const majorFingerprints = [
    professionalized >= 55,
    generic >= 55,
    predictable >= 60,
    uniform >= 62,
    textFingerprints ? textFingerprints.textbookCadence >= 2 : false,
    textFingerprints ? textFingerprints.abstractDensity >= 4 : false,
    textFingerprints ? textFingerprints.genericEducationalOpeners >= 1 : false,
    textFingerprints ? textFingerprints.excessiveConfidence : false,
    lowFlow >= 55,
    lowCompression >= 60
  ].filter(Boolean).length;

  const evidenceBasedScore = normalizeScore(100 - fingerprintStrength);
  const cappedScore =
    majorFingerprints >= 5
      ? Math.min(evidenceBasedScore, 45)
      : majorFingerprints >= 4
        ? Math.min(evidenceBasedScore, 55)
        : majorFingerprints >= 3
          ? Math.min(evidenceBasedScore, 65)
          : majorFingerprints >= 2
            ? Math.min(evidenceBasedScore, 75)
            : evidenceBasedScore;

  if (majorFingerprints === 0) return normalizeScore(Math.max(current, evidenceBasedScore, 86));
  if (majorFingerprints === 1) return normalizeScore(Math.min(Math.max(current, evidenceBasedScore), 84));

  return normalizeScore(Math.min(current * 0.35 + cappedScore * 0.65, cappedScore));
}

function detectTextFingerprints(text: string) {
  const lower = text.toLowerCase();
  const paragraphs = text.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
  const words = lower.match(/\b[\w']+\b/g) ?? [];
  const abstractTerms = [
    "meaning",
    "identity",
    "existence",
    "consciousness",
    "humanity",
    "society",
    "morality",
    "guidance",
    "understanding",
    "cosmos",
    "culture",
    "civilization",
    "tradition",
    "values",
    "beliefs",
    "framework",
    "significance",
    "relationship",
    "phenomena",
    "interpretation"
  ];
  const genericOpeners = [
    "one of humanity",
    "throughout history",
    "for thousands of years",
    "since the beginning",
    "the origins of",
    "in many cultures",
    "across cultures",
    "played an important role"
  ];
  const significanceMarkers = [
    "this shows",
    "this demonstrates",
    "this highlights",
    "this illustrates",
    "this reflects",
    "this underscores",
    "this reveals",
    "this suggests",
    "important because",
    "significant because",
    "served as",
    "provided a way",
    "helped people understand"
  ];
  const uncertaintyMarkers = [
    "maybe",
    "likely",
    "probably",
    "it seems",
    "might",
    "could be",
    "some historians",
    "some researchers",
    "many researchers",
    "many scholars",
    "argue",
    "suggest"
  ];

  const abstractHits = abstractTerms.reduce((sum, term) => sum + countOccurrences(lower, term), 0);
  const abstractDensity = words.length ? (abstractHits / words.length) * 100 : 0;
  const genericEducationalOpeners = genericOpeners.filter((term) => lower.includes(term)).length;
  const significanceCount = significanceMarkers.reduce((sum, term) => sum + countOccurrences(lower, term), 0);
  const textbookCadence = paragraphs.filter((paragraph) => {
    const sentenceCount = paragraph.split(/[.!?]+/).filter((item) => item.trim()).length;
    const paragraphLower = paragraph.toLowerCase();
    return sentenceCount >= 3 && significanceMarkers.some((term) => paragraphLower.includes(term));
  }).length;
  const balancedLists = (text.match(/\b[^,.!?;]+,\s+[^,.!?;]+,\s+(?:and|or)\s+[^,.!?;]+/gi) ?? []).length;
  const hasUncertainty = uncertaintyMarkers.some((term) => lower.includes(term));
  const excessiveConfidence = words.length >= 180 && !hasUncertainty && significanceCount >= 2;
  const score = normalizeScore(
    textbookCadence * 18 +
      genericEducationalOpeners * 16 +
      abstractDensity * 7 +
      significanceCount * 5 +
      balancedLists * 6 +
      (excessiveConfidence ? 14 : 0)
  );

  return {
    score,
    textbookCadence,
    abstractDensity,
    genericEducationalOpeners,
    excessiveConfidence
  };
}

function countOccurrences(text: string, phrase: string) {
  return text.split(phrase).length - 1;
}
