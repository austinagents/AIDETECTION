import { NextResponse } from "next/server";
import { getStorageMode } from "@/lib/storage";
import { isSupabaseConfigured } from "@/lib/storage/supabaseStorage";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
    supabaseConfigured: isSupabaseConfigured(),
    storageMode: getStorageMode()
  });
}
