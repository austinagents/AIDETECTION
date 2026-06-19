import { NextResponse } from "next/server";
import { AppError, classifyStorageError, isAppError, publicError } from "@/lib/api/errors";
import { LOCAL_USER_ID } from "@/lib/constants";
import { getStorage } from "@/lib/storage";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  try {
    const analysis = await getStorage().getAnalysis(LOCAL_USER_ID, params.id).catch((error) => {
      throw classifyStorageError(error);
    });
    if (!analysis) throw new AppError("STORAGE_ERROR", "Analysis not found.", 404);
    return NextResponse.json({ ok: true, analysis });
  } catch (error) {
    console.error("GET /api/history/[id] failed", error);
    const response = publicError(isAppError(error) ? error : error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
