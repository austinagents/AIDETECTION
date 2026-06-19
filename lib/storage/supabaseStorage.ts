import { createClient } from "@supabase/supabase-js";
import { AnalysisRecord, ProfileRecord, WritingSample } from "@/lib/types";
import { AddWritingSampleInput, CreateAnalysisInput, CreateFeedbackInput, CreateRevisionInput, StorageAdapter } from "./types";

export function isSupabaseConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function ensureUser(userId: string) {
  const supabase = client();
  if (!supabase) return;
  const { error } = await supabase
    .from("users")
    .upsert({ id: userId, email: null }, { onConflict: "id" });
  if (error) throw error;
}

function mapAnalysis(row: any): AnalysisRecord {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    originalText: row.original_text,
    contentType: row.content_type,
    result: row.result_json,
    overallRisk: row.overall_risk,
    riskLabel: row.risk_label,
    createdAt: row.created_at
  };
}

export const supabaseStorage: StorageAdapter | null = isSupabaseConfigured()
  ? {
      async listAnalyses(userId) {
        const { data, error } = await client()!
          .from("analyses")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false });
        if (error) throw error;
        return (data ?? []).map(mapAnalysis);
      },

      async getAnalysis(userId, id) {
        const { data, error } = await client()!
          .from("analyses")
          .select("*")
          .eq("user_id", userId)
          .eq("id", id)
          .maybeSingle();
        if (error) throw error;
        return data ? mapAnalysis(data) : null;
      },

      async createAnalysis(input: CreateAnalysisInput) {
        await ensureUser(input.userId);
        const { data, error } = await client()!
          .from("analyses")
          .insert({
            user_id: input.userId,
            title: input.title,
            original_text: input.originalText,
            content_type: input.contentType,
            result_json: input.result,
            overall_risk: input.result.overallRisk,
            risk_label: input.result.riskLabel
          })
          .select("*")
          .single();
        if (error) throw error;
        return mapAnalysis(data);
      },

      async listWritingSamples(userId) {
        const { data, error } = await client()!
          .from("writing_samples")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false });
        if (error) throw error;
        return (data ?? []).map((row): WritingSample => ({
          id: row.id,
          userId: row.user_id,
          title: row.title,
          content: row.content,
          contentType: row.content_type,
          createdAt: row.created_at
        }));
      },

      async addWritingSample(input: AddWritingSampleInput) {
        await ensureUser(input.userId);
        const { data, error } = await client()!
          .from("writing_samples")
          .insert({
            user_id: input.userId,
            title: input.title,
            content: input.content,
            content_type: input.contentType
          })
          .select("*")
          .single();
        if (error) throw error;
        return {
          id: data.id,
          userId: data.user_id,
          title: data.title,
          content: data.content,
          contentType: data.content_type,
          createdAt: data.created_at
        };
      },

      async getStyleProfile(userId) {
        const { data, error } = await client()!
          .from("writing_profiles")
          .select("*")
          .eq("user_id", userId)
          .maybeSingle();
        if (error) throw error;
        return data
          ? ({
              id: data.id,
              userId: data.user_id,
              profile: data.profile_json,
              sampleCount: data.sample_count,
              createdAt: data.created_at,
              updatedAt: data.updated_at
            } satisfies ProfileRecord)
          : null;
      },

      async upsertStyleProfile(userId, profile, sampleCount) {
        await ensureUser(userId);
        const existing = await this.getStyleProfile(userId);
        const payload = {
          user_id: userId,
          profile_json: profile,
          sample_count: sampleCount,
          updated_at: new Date().toISOString()
        };
        const query = existing
          ? client()!.from("writing_profiles").update(payload).eq("id", existing.id)
          : client()!.from("writing_profiles").insert(payload);
        const { data, error } = await query.select("*").single();
        if (error) throw error;
        return {
          id: data.id,
          userId: data.user_id,
          profile: data.profile_json,
          sampleCount: data.sample_count,
          createdAt: data.created_at,
          updatedAt: data.updated_at
        };
      },

      async createRevision(input: CreateRevisionInput) {
        const { data, error } = await client()!
          .from("revisions")
          .insert({
            analysis_id: input.analysisId,
            paragraph_index: input.paragraphIndex,
            original_text: input.originalText,
            revised_text: input.revisedText,
            revision_type: input.revisionType
          })
          .select("*")
          .single();
        if (error) throw error;
        return {
          id: data.id,
          analysisId: data.analysis_id,
          paragraphIndex: data.paragraph_index,
          originalText: data.original_text,
          revisedText: data.revised_text,
          revisionType: data.revision_type,
          createdAt: data.created_at
        };
      },

      async createFeedback(input: CreateFeedbackInput) {
        await ensureUser(input.userId);
        const { data, error } = await client()!
          .from("feedback")
          .insert({
            analysis_id: input.analysisId,
            user_id: input.userId,
            user_rating: input.userRating,
            outcome_label: input.outcomeLabel,
            notes: input.notes
          })
          .select("*")
          .single();
        if (error) throw error;
        return {
          id: data.id,
          analysisId: data.analysis_id,
          userId: data.user_id,
          userRating: data.user_rating,
          outcomeLabel: data.outcome_label,
          notes: data.notes,
          createdAt: data.created_at
        };
      }
    }
  : null;
