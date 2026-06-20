import { AnalysisScores } from "@/lib/types";
import { normalizeScore } from "./normalizeScore";

type CalibratedScores = Partial<AnalysisScores>;

export function calibrateDetectorRisk(score: number, scores: CalibratedScores | undefined, text?: string) {
  if (!scores) return normalizeScore(score);

  const current = normalizeScore(score);
  const professionalized = normalizeScore(scores.professionalizedWritingBias);
  const generic = normalizeScore(scores.genericPhrasing);
  const predictable = normalizeScore(scores.predictableStructure);
  const balanced = normalizeScore(scores.balancedConstruction);
  const textbook = normalizeScore(scores.textbookCadence);
  const abstractDensity = normalizeScore(scores.abstractNounDensity);
  const institutional = normalizeScore(scores.institutionalLanguage);
  const overExplanation = normalizeScore(scores.overExplanation);
  const smoothCertainty = normalizeScore(scores.smoothCertainty);
  const repetitive = normalizeScore(scores.repetitiveCadence);
  const expertVoice = normalizeScore(scores.genericExpertVoice);
  const lowEntropy = normalizeScore(scores.lowStylisticEntropy);
  const textFingerprints = text ? detectTextFingerprints(text) : null;

  const fingerprintRisk = normalizeScore(
    professionalized * 0.18 +
      generic * 0.14 +
      predictable * 0.12 +
      balanced * 0.1 +
      textbook * 0.14 +
      abstractDensity * 0.08 +
      institutional * 0.08 +
      overExplanation * 0.06 +
      smoothCertainty * 0.05 +
      repetitive * 0.05 +
      expertVoice * 0.04 +
      lowEntropy * 0.04 +
      (textFingerprints?.score ?? 0) * 0.28
  );
  const majorFingerprints = [
    professionalized >= 55,
    generic >= 55,
    predictable >= 60,
    balanced >= 62,
    textbook >= 60,
    abstractDensity >= 60,
    institutional >= 60,
    overExplanation >= 60,
    smoothCertainty >= 60,
    repetitive >= 60,
    expertVoice >= 60,
    textFingerprints ? textFingerprints.textbookCadence >= 2 : false,
    textFingerprints ? textFingerprints.abstractDensity >= 4 : false,
    textFingerprints ? textFingerprints.genericEducationalOpeners >= 1 : false,
    textFingerprints ? textFingerprints.excessiveConfidence : false
  ].filter(Boolean).length;
  const floor =
    majorFingerprints >= 5
      ? 82
      : majorFingerprints >= 4
        ? 72
        : majorFingerprints >= 3
          ? 62
          : majorFingerprints >= 2
            ? 48
            : majorFingerprints === 1
              ? 32
              : 0;

  return normalizeScore(Math.max(current, fingerprintRisk, floor));
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
