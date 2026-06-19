import { LOCAL_USER_ID, demoAnalysis, emptyStyleProfile } from "@/lib/constants";
import { getStorageMode } from "@/lib/storage";
import { getSupabaseClient, ensureSupabaseUser, isSupabaseConfigured } from "@/lib/storage/supabaseStorage";

const HEALTH_USER_ID = "00000000-0000-4000-8000-0000000000db";

const tables = ["users", "writing_samples", "writing_profiles", "analyses", "revisions", "feedback"] as const;

type Step = {
  name: string;
  ok: boolean;
  error?: string;
};

type InsertedRow = {
  id: string;
  [key: string]: unknown;
};

export async function runDatabaseHealthCheck() {
  const configured = isSupabaseConfigured();
  const supabase = getSupabaseClient();
  const steps: Step[] = [];
  const existingTables: string[] = [];
  const cleanup: Array<() => Promise<void>> = [];

  if (!configured || !supabase) {
    return {
      ok: false,
      supabaseConfigured: configured,
      storageMode: getStorageMode(),
      tables: existingTables,
      steps: [{ name: "supabase_configured", ok: false, error: "Supabase env vars are not configured." }]
    };
  }

  for (const table of tables) {
    const { error } = await supabase.from(table).select("id").limit(1);
    if (error) {
      steps.push({ name: `table:${table}`, ok: false, error: error.message });
    } else {
      existingTables.push(table);
      steps.push({ name: `table:${table}`, ok: true });
    }
  }

  await recordStep(steps, "upsert_local_user", () => ensureSupabaseUser(LOCAL_USER_ID));
  const healthUser = await recordStep(steps, "upsert_health_user", () => ensureSupabaseUser(HEALTH_USER_ID));

  const analysis = healthUser.ok
    ? await recordStep(steps, "insert_analysis", async () => {
      const { data, error } = await supabase
        .from("analyses")
        .insert({
          user_id: HEALTH_USER_ID,
          title: "DB health check analysis",
          original_text: "Temporary database health check text.",
          content_type: "Other",
          result_json: { ...demoAnalysis, paragraphs: [] },
          overall_risk: 12,
          risk_label: "low"
        })
        .select("id,result_json,created_at")
        .single();
      if (error) throw error;
      cleanup.push(async () => {
        await supabase.from("analyses").delete().eq("id", data.id);
      });
      return data;
    })
    : skipStep<InsertedRow>(steps, "insert_analysis", "Skipped because health user upsert failed.");

  if (analysis.ok) {
    await recordStep(steps, "read_history", async () => {
      const { data, error } = await supabase
        .from("analyses")
        .select("id,result_json,created_at")
        .eq("user_id", HEALTH_USER_ID)
        .limit(1);
      if (error) throw error;
      if (!data?.length) throw new Error("No analysis rows returned for health user.");
      if (!data[0].result_json) throw new Error("result_json was not returned.");
    });
  } else {
    skipStep(steps, "read_history", "Skipped because analysis insert failed.");
  }

  if (analysis.ok) {
    await recordStep(steps, "insert_revision", async () => {
      const { data, error } = await supabase
        .from("revisions")
        .insert({
          analysis_id: analysis.result.id,
          paragraph_index: 0,
          original_text: "Original health paragraph.",
          revised_text: "Revised health paragraph.",
          revision_type: "improve"
        })
        .select("id,created_at")
        .single();
      if (error) throw error;
      cleanup.push(async () => {
        await supabase.from("revisions").delete().eq("id", data.id);
      });
    });
  } else {
    skipStep(steps, "insert_revision", "Skipped because analysis insert failed.");
  }

  if (healthUser.ok) {
    await recordStep(steps, "insert_writing_sample", async () => {
      const { data, error } = await supabase
        .from("writing_samples")
        .insert({
          user_id: HEALTH_USER_ID,
          title: "DB health check sample",
          content: "Temporary database health check writing sample.",
          content_type: "Other"
        })
        .select("id,created_at")
        .single();
      if (error) throw error;
      cleanup.push(async () => {
        await supabase.from("writing_samples").delete().eq("id", data.id);
      });
    });
  } else {
    skipStep(steps, "insert_writing_sample", "Skipped because health user upsert failed.");
  }

  const profile = healthUser.ok
    ? await recordStep(steps, "upsert_writing_profile", async () => {
      const { data, error } = await supabase
        .from("writing_profiles")
        .upsert(
          {
            user_id: HEALTH_USER_ID,
            profile_json: emptyStyleProfile,
            sample_count: 0,
            updated_at: new Date().toISOString()
          },
          { onConflict: "user_id" }
        )
        .select("id,profile_json,created_at,updated_at")
        .single();
      if (error) throw error;
      return data;
    })
    : skipStep<InsertedRow>(steps, "upsert_writing_profile", "Skipped because health user upsert failed.");

  if (profile.ok) {
    cleanup.push(async () => {
      await supabase.from("writing_profiles").delete().eq("id", profile.result.id);
    });
  }

  if (analysis.ok && healthUser.ok) {
    await recordStep(steps, "insert_feedback", async () => {
      const { data, error } = await supabase
        .from("feedback")
        .insert({
          analysis_id: analysis.result.id,
          user_id: HEALTH_USER_ID,
          user_rating: 1,
          outcome_label: "other",
          notes: "Temporary database health check feedback."
        })
        .select("id,created_at")
        .single();
      if (error) throw error;
      cleanup.push(async () => {
        await supabase.from("feedback").delete().eq("id", data.id);
      });
    });
  } else {
    skipStep(steps, "insert_feedback", "Skipped because analysis insert or health user upsert failed.");
  }

  for (const remove of cleanup.reverse()) {
    await remove().catch(() => undefined);
  }

  return {
    ok: steps.every((step) => step.ok),
    supabaseConfigured: configured,
    storageMode: getStorageMode(),
    tables: existingTables,
    steps
  };
}

async function recordStep<T>(steps: Step[], name: string, run: () => Promise<T>): Promise<{ ok: true; result: T } | { ok: false }> {
  try {
    const result = await run();
    steps.push({ name, ok: true });
    return { ok: true, result };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    steps.push({ name, ok: false, error: message });
    return { ok: false };
  }
}

function skipStep<T>(steps: Step[], name: string, error: string): { ok: false; result?: T } {
  steps.push({ name, ok: false, error });
  return { ok: false };
}
