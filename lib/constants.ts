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
    "The draft has some natural human signals, but several polished, generalized passages may read as AI-like for the context.",
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
    "The writing would benefit from plainer, more context-appropriate phrasing and concrete grounding."
  ],
  humanAuthorshipEvidence: [
    "Some claims show ordinary authorial choices.",
    "The draft has a consistent topic focus."
  ],
  aiAuthorshipEvidence: [
    "Several ideas are weighted evenly instead of prioritized.",
    "The writing relies on broad summary language.",
    "The tone sounds more professionally polished than the context requires."
  ],
  documentEvidence: [
    "The document would feel more naturally human if it used less professionalized framing."
  ],
  paragraphs: [],
  revisionStrategy: [
    "Replace broad professionalized phrasing with plainer wording.",
    "Reduce formulaic structure and overly balanced phrasing.",
    "Add concrete grounding where the writing feels abstract."
  ],
  styleAlignedSuggestions: [
    "Save writing samples to receive suggestions that better match your own voice."
  ]
};

export function riskLabelFor(score: number): RiskLabel {
  return riskLabelFromRiskScore(score);
}
