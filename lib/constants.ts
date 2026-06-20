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
    "The draft contains several AI-detector risk signals, including polished generalized phrasing and repeated academic cadence.",
  scores: {
    textbookCadence: 72,
    genericPhrasing: 74,
    professionalizedWritingBias: 70,
    predictableStructure: 72,
    balancedConstruction: 68,
    abstractNounDensity: 62,
    institutionalLanguage: 66,
    overExplanation: 58,
    smoothCertainty: 64,
    repetitiveCadence: 61,
    genericExpertVoice: 59,
    lowStylisticEntropy: 54
  },
  mainReasons: [
    "Several transitions are broad and familiar rather than specific to the topic.",
    "Paragraphs follow a similar shape and level of polish.",
    "The writing uses professionalized academic phrasing that may be flagged by detector-style systems."
  ],
  detectorSignals: [
    "Textbook-style cadence appears across sections.",
    "The writing relies on broad summary language.",
    "The tone sounds professionally polished in a detector-risk pattern."
  ],
  documentEvidence: [
    "Detector signals include balanced structure, generic transitions, and institutional phrasing."
  ],
  paragraphs: [],
  revisionStrategy: [
    "Reduce professionalized phrasing.",
    "Reduce formulaic structure and overly balanced phrasing.",
    "Reduce abstract framing and generic transitions."
  ],
  styleAlignedSuggestions: [
    "Save writing samples to receive suggestions that better match your own voice."
  ]
};

export function riskLabelFor(score: number): RiskLabel {
  return riskLabelFromRiskScore(score);
}
