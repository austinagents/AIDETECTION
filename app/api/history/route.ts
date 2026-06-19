import { NextResponse } from "next/server";
import { classifyStorageError, isAppError, publicError } from "@/lib/api/errors";
import { LOCAL_USER_ID } from "@/lib/constants";
import { getStorage } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const analyses = await getStorage().listAnalyses(LOCAL_USER_ID).catch((error) => {
      throw classifyStorageError(error);
    });
    return NextResponse.json({ ok: true, analyses });
  } catch (error) {
    console.error("GET /api/history failed", error);
    const response = publicError(isAppError(error) ? error : error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
