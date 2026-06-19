import { AnalysisRecord, AnalysisResult, ContentType, FeedbackRecord, ProfileRecord, RevisionRecord, StyleProfile, WritingSample } from "@/lib/types";

export type CreateAnalysisInput = {
  userId: string;
  title: string;
  originalText: string;
  contentType: ContentType;
  result: AnalysisResult;
};

export type AddWritingSampleInput = {
  userId: string;
  title: string;
  content: string;
  contentType: ContentType;
};

export type CreateRevisionInput = {
  analysisId: string;
  paragraphIndex: number;
  originalText: string;
  revisedText: string;
  revisionType: string;
};

export type CreateFeedbackInput = {
  analysisId: string;
  userId: string;
  userRating: number;
  outcomeLabel?: FeedbackRecord["outcomeLabel"];
  notes?: string;
};

export type StorageAdapter = {
  listAnalyses(userId: string): Promise<AnalysisRecord[]>;
  getAnalysis(userId: string, id: string): Promise<AnalysisRecord | null>;
  createAnalysis(input: CreateAnalysisInput): Promise<AnalysisRecord>;
  listWritingSamples(userId: string): Promise<WritingSample[]>;
  addWritingSample(input: AddWritingSampleInput): Promise<WritingSample>;
  getStyleProfile(userId: string): Promise<ProfileRecord | null>;
  upsertStyleProfile(userId: string, profile: StyleProfile, sampleCount: number): Promise<ProfileRecord>;
  createRevision(input: CreateRevisionInput): Promise<RevisionRecord>;
  createFeedback(input: CreateFeedbackInput): Promise<FeedbackRecord>;
};
