import { AnalysisResult, RiskLabel, StyleProfile } from "@/lib/types";

export const LOCAL_USER_ID = "local-demo-user";

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
    "The draft has several polished, generalized passages with steady sentence structure. Adding concrete examples and more personal framing would lower the AI-likeness risk.",
  scores: {
    predictability: 72,
    structuralUniformity: 68,
    genericPhrasing: 74,
    specificity: 39,
    personalVoice: 44,
    emotionalTexture: 41,
    vocabularyNaturalness: 58,
    sentenceRhythmVariance: 46
  },
  mainReasons: [
    "Several transitions are broad and familiar rather than specific to the topic.",
    "Paragraphs follow a similar shape and level of polish.",
    "The writing would benefit from concrete details, memories, examples, or constraints."
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
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  return "low";
}
