import { NextResponse } from "next/server";
import { AppError, classifyStorageError, isAppError, publicError } from "@/lib/api/errors";
import { LOCAL_USER_ID } from "@/lib/constants";
import { analyzeWriting } from "@/lib/openai/analyzeWriting";
import { getStorage } from "@/lib/storage";
import { ContentType } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const title = String(body.title || "Untitled analysis");
    const content = String(body.content || "");
    const contentType = (body.contentType || "Other") as ContentType;
    const useProfile = Boolean(body.useProfile);

    if (content.trim().length < 40) {
      throw new AppError("VALIDATION_ERROR", "Add at least a short paragraph before running analysis.", 400);
    }

    const storage = getStorage();
    const profile = useProfile
      ? await storage.getStyleProfile(LOCAL_USER_ID).catch((error) => {
          throw classifyStorageError(error);
        })
      : null;
    const result = await analyzeWriting({
      title,
      content,
      contentType,
      styleProfile: profile?.profile ?? null
    });
    const analysis = await storage
      .createAnalysis({
        userId: LOCAL_USER_ID,
        title,
        originalText: content,
        contentType,
        result
      })
      .catch((error) => {
        throw classifyStorageError(error);
      });

    return NextResponse.json({ ok: true, analysis });
  } catch (error) {
    console.error("POST /api/analyze failed", error);
    const response = publicError(isAppError(error) ? error : error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
