import { NextResponse } from "next/server";
import { classifyStorageError, isAppError, publicError } from "@/lib/api/errors";
import { LOCAL_USER_ID, emptyStyleProfile } from "@/lib/constants";
import { getStorage } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const storage = getStorage();
    const [profile, samples] = await Promise.all([
      storage.getStyleProfile(LOCAL_USER_ID).catch((error) => {
        throw classifyStorageError(error);
      }),
      storage.listWritingSamples(LOCAL_USER_ID).catch((error) => {
        throw classifyStorageError(error);
      })
    ]);
    return NextResponse.json({
      ok: true,
      profile: profile?.profile ?? emptyStyleProfile,
      sampleCount: profile?.sampleCount ?? samples.length,
      samples
    });
  } catch (error) {
    console.error("GET /api/style/profile failed", error);
    const response = publicError(isAppError(error) ? error : error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
