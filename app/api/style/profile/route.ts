import { NextResponse } from "next/server";
import { LOCAL_USER_ID, emptyStyleProfile } from "@/lib/constants";
import { getStorage } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const storage = getStorage();
    const [profile, samples] = await Promise.all([
      storage.getStyleProfile(LOCAL_USER_ID),
      storage.listWritingSamples(LOCAL_USER_ID)
    ]);
    return NextResponse.json({
      profile: profile?.profile ?? emptyStyleProfile,
      sampleCount: profile?.sampleCount ?? samples.length,
      samples
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load profile." }, { status: 500 });
  }
}
