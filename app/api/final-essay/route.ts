import { NextResponse } from "next/server";
import { AppError, classifyStorageError, isAppError, publicError } from "@/lib/api/errors";
import { LOCAL_USER_ID } from "@/lib/constants";
import { analyzeWriting } from "@/lib/openai/analyzeWriting";
import { getStorage } from "@/lib/storage";
import { ContentType } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const analysisId = String(body.analysisId || "");
    const content = String(body.content || "");

    if (content.trim().length < 40) {
      throw new AppError("VALIDATION_ERROR", "Add at least a short paragraph before running final analysis.", 400);
    }

    const storage = getStorage();
    const sourceAnalysis = analysisId
      ? await storage.getAnalysis(LOCAL_USER_ID, analysisId).catch((error) => {
          throw classifyStorageError(error);
        })
      : null;
    const contentType = (sourceAnalysis?.contentType ?? "Essay") as ContentType;
    const result = await analyzeWriting({
      title: "Final essay",
      content,
      contentType,
      styleProfile: null
    });

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error("POST /api/final-essay failed", error);
    const response = publicError(isAppError(error) ? error : error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
