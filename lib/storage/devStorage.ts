import { promises as fs } from "fs";
import path from "path";
import { emptyStyleProfile } from "@/lib/constants";
import { AnalysisRecord, FeedbackRecord, ProfileRecord, RevisionRecord, WritingSample } from "@/lib/types";
import { AddWritingSampleInput, CreateAnalysisInput, CreateFeedbackInput, CreateRevisionInput, StorageAdapter } from "./types";

type DevData = {
  analyses: AnalysisRecord[];
  samples: WritingSample[];
  profiles: ProfileRecord[];
  revisions: RevisionRecord[];
  feedback: FeedbackRecord[];
};

const dataFile = path.join(process.cwd(), "dev-data.json");
const memoryKey = "__writing_review_dev_data__";

const emptyData: DevData = {
  analyses: [],
  samples: [],
  profiles: [],
  revisions: [],
  feedback: []
};

function memoryData(): DevData {
  const globalStore = globalThis as typeof globalThis & { [memoryKey]?: DevData };
  if (!globalStore[memoryKey]) {
    globalStore[memoryKey] = structuredClone(emptyData);
  }
  return globalStore[memoryKey];
}

function id() {
  return crypto.randomUUID();
}

async function readData(): Promise<DevData> {
  try {
    const raw = await fs.readFile(dataFile, "utf8");
    return JSON.parse(raw) as DevData;
  } catch {
    return memoryData();
  }
}

async function writeData(data: DevData) {
  const globalStore = globalThis as typeof globalThis & { [memoryKey]?: DevData };
  globalStore[memoryKey] = data;
  try {
    await fs.writeFile(dataFile, JSON.stringify(data, null, 2), "utf8");
  } catch {
    // Some serverless previews have read-only project filesystems before Supabase is configured.
  }
}

export const devStorage: StorageAdapter = {
  async listAnalyses(userId) {
    const data = await readData();
    return data.analyses.filter((item) => item.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async getAnalysis(userId, analysisId) {
    const data = await readData();
    return data.analyses.find((item) => item.userId === userId && item.id === analysisId) ?? null;
  },

  async createAnalysis(input: CreateAnalysisInput) {
    const data = await readData();
    const record: AnalysisRecord = {
      id: id(),
      userId: input.userId,
      title: input.title,
      originalText: input.originalText,
      contentType: input.contentType,
      result: input.result,
      overallRisk: input.result.overallRisk,
      riskLabel: input.result.riskLabel,
      createdAt: new Date().toISOString()
    };
    data.analyses.unshift(record);
    await writeData(data);
    return record;
  },

  async listWritingSamples(userId) {
    const data = await readData();
    return data.samples.filter((item) => item.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async addWritingSample(input: AddWritingSampleInput) {
    const data = await readData();
    const sample: WritingSample = {
      id: id(),
      userId: input.userId,
      title: input.title,
      content: input.content,
      contentType: input.contentType,
      createdAt: new Date().toISOString()
    };
    data.samples.unshift(sample);
    await writeData(data);
    return sample;
  },

  async getStyleProfile(userId) {
    const data = await readData();
    return data.profiles.find((item) => item.userId === userId) ?? null;
  },

  async upsertStyleProfile(userId, profile, sampleCount) {
    const data = await readData();
    const existing = data.profiles.find((item) => item.userId === userId);
    const now = new Date().toISOString();
    if (existing) {
      existing.profile = profile;
      existing.sampleCount = sampleCount;
      existing.updatedAt = now;
      await writeData(data);
      return existing;
    }
    const record: ProfileRecord = {
      id: id(),
      userId,
      profile: profile ?? emptyStyleProfile,
      sampleCount,
      createdAt: now,
      updatedAt: now
    };
    data.profiles.push(record);
    await writeData(data);
    return record;
  },

  async createRevision(input: CreateRevisionInput) {
    const data = await readData();
    const revision: RevisionRecord = {
      id: id(),
      analysisId: input.analysisId,
      paragraphIndex: input.paragraphIndex,
      originalText: input.originalText,
      revisedText: input.revisedText,
      revisionType: input.revisionType,
      createdAt: new Date().toISOString()
    };
    data.revisions.unshift(revision);
    await writeData(data);
    return revision;
  },

  async createFeedback(input: CreateFeedbackInput) {
    const data = await readData();
    const feedback: FeedbackRecord = {
      id: id(),
      analysisId: input.analysisId,
      userId: input.userId,
      userRating: input.userRating,
      outcomeLabel: input.outcomeLabel,
      notes: input.notes,
      createdAt: new Date().toISOString()
    };
    data.feedback.unshift(feedback);
    await writeData(data);
    return feedback;
  }
};
