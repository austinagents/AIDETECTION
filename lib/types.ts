export type RiskLabel = "low" | "medium" | "high";
export type Confidence = "low" | "medium" | "high";
export type ContentType = "Essay" | "Social Post" | "Blog Article" | "Email" | "Personal Statement" | "Other";

export type AnalysisScores = {
  predictability: number;
  structuralUniformity: number;
  genericPhrasing: number;
  specificity: number;
  personalVoice: number;
  emotionalTexture: number;
  vocabularyNaturalness: number;
  sentenceRhythmVariance: number;
};

export type ParagraphAnalysis = {
  index: number;
  text: string;
  risk: number;
  riskLabel: RiskLabel;
  reasons: string[];
  suggestions: string[];
};

export type AnalysisResult = {
  overallRisk: number;
  confidence: Confidence;
  riskLabel: RiskLabel;
  summary: string;
  scores: AnalysisScores;
  mainReasons: string[];
  paragraphs: ParagraphAnalysis[];
  revisionStrategy: string[];
  styleAlignedSuggestions: string[];
};

export type StyleProfile = {
  tone: string;
  sentenceLength: string;
  vocabularyLevel: string;
  commonPatterns: string[];
  commonPhrases: string[];
  punctuationHabits: string[];
  paragraphStyle: string;
  strengths: string[];
  quirks: string[];
  avoidances: string[];
  exampleVoiceSummary: string;
  styleRules: string[];
};

export type WritingSample = {
  id: string;
  userId: string;
  title: string;
  content: string;
  contentType: ContentType;
  createdAt: string;
};

export type AnalysisRecord = {
  id: string;
  userId: string;
  title: string;
  originalText: string;
  contentType: ContentType;
  result: AnalysisResult;
  overallRisk: number;
  riskLabel: RiskLabel;
  createdAt: string;
};

export type RevisionRecord = {
  id: string;
  analysisId: string;
  paragraphIndex: number;
  originalText: string;
  revisedText: string;
  revisionType: string;
  createdAt: string;
};

export type FeedbackRecord = {
  id: string;
  analysisId: string;
  userId: string;
  userRating: number;
  outcomeLabel?: "submitted_no_issue" | "received_feedback" | "got_grade" | "other";
  notes?: string;
  createdAt: string;
};

export type ProfileRecord = {
  id: string;
  userId: string;
  profile: StyleProfile;
  sampleCount: number;
  createdAt: string;
  updatedAt: string;
};
