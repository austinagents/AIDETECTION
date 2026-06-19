import { NextResponse } from "next/server";
import { AppError, classifyStorageError, isAppError, publicError } from "@/lib/api/errors";
import { LOCAL_USER_ID } from "@/lib/constants";
import { updateStyleProfile } from "@/lib/openai/updateStyleProfile";
import { getStorage } from "@/lib/storage";
import { ContentType } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const title = String(body.title || "Untitled sample");
    const content = String(body.content || "");
    const contentType = (body.contentType || "Other") as ContentType;

    if (content.trim().length < 60) {
      throw new AppError("VALIDATION_ERROR", "Add a longer writing sample so the profile has enough signal.", 400);
    }

    const storage = getStorage();
    const sample = await storage.addWritingSample({ userId: LOCAL_USER_ID, title, content, contentType }).catch((error) => {
      throw classifyStorageError(error);
    });
    const [samples, current] = await Promise.all([
      storage.listWritingSamples(LOCAL_USER_ID).catch((error) => {
        throw classifyStorageError(error);
      }),
      storage.getStyleProfile(LOCAL_USER_ID).catch((error) => {
        throw classifyStorageError(error);
      })
    ]);
    const profile = await updateStyleProfile(samples, current?.profile ?? null);
    const profileRecord = await storage.upsertStyleProfile(LOCAL_USER_ID, profile, samples.length).catch((error) => {
      throw classifyStorageError(error);
    });

    return NextResponse.json({ ok: true, sample, profile: profileRecord.profile, sampleCount: profileRecord.sampleCount });
  } catch (error) {
    console.error("POST /api/style/sample failed", error);
    const response = publicError(isAppError(error) ? error : error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
