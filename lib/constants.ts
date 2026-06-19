import { AnalysisResult, RiskLabel, StyleProfile } from "@/lib/types";
import { riskLabelFromRiskScore } from "@/lib/scoring/normalizeScore";

export const LOCAL_USER_ID = "00000000-0000-4000-8000-000000000001";

export const emptyStyleProfile: StyleProfile = {
  tone: "Not enough saved writing yet",
  sentenceLength: "Unknown",
  vocabularyLevel: "Unknown",
  commonPatterns: [],
  commonPhrases: [],
  punctuationHabits: [],
  paragraphStyle: "Unknown",
  strengths: [],
  quirks: [],
  avoidances: [],
  exampleVoiceSummary: "Add a few samples to build a personal voice profile.",
  styleRules: []
};

export const demoAnalysis: AnalysisResult = {
  overallRisk: 64,
  confidence: "medium",
  riskLabel: "medium",
  summary:
    "The draft has some authentic signals, but several polished, generalized passages would benefit from concrete examples and more personal framing.",
  scores: {
    authorialJudgment: 52,
    predictability: 72,
    structuralUniformity: 68,
    genericPhrasing: 74,
    professionalizedWritingBias: 70,
    specificity: 39,
    informationHierarchy: 48,
    personalVoice: 44,
    voiceOwnership: 44,
    informationCompression: 42,
    surpriseContrast: 38,
    naturalFlow: 46,
    emotionalTexture: 41,
    vocabularyNaturalness: 58,
    sentenceRhythmVariance: 46
  },
  mainReasons: [
    "Several transitions are broad and familiar rather than specific to the topic.",
    "Paragraphs follow a similar shape and level of polish.",
    "The writing would benefit from concrete details, memories, examples, or constraints."
  ],
  humanAuthorshipEvidence: [
    "Some claims show an attempt to explain significance.",
    "The draft has a consistent topic focus."
  ],
  aiAuthorshipEvidence: [
    "Several ideas are weighted evenly instead of prioritized.",
    "The writing relies on broad summary language.",
    "The tone sounds more professionally polished than the context requires."
  ],
  documentEvidence: [
    "The document would feel more authored if the argument developed through clearer choices and contrasts."
  ],
  paragraphs: [],
  revisionStrategy: [
    "Replace broad claims with specific scenes, numbers, names, or examples.",
    "Vary sentence openings and paragraph lengths.",
    "Add one or two details that only the writer would naturally include."
  ],
  styleAlignedSuggestions: [
    "Save writing samples to receive suggestions that better match your own voice."
  ]
};

export function riskLabelFor(score: number): RiskLabel {
  return riskLabelFromRiskScore(score);
}
