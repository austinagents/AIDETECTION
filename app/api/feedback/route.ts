import { NextResponse } from "next/server";
import { classifyStorageError, isAppError, publicError } from "@/lib/api/errors";
import { LOCAL_USER_ID } from "@/lib/constants";
import { getStorage } from "@/lib/storage";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const feedback = await getStorage()
      .createFeedback({
        analysisId: String(body.analysisId || ""),
        userId: LOCAL_USER_ID,
        userRating: Number(body.userRating || 0),
        notes: body.notes ? String(body.notes) : undefined,
        outcomeLabel: body.outcomeLabel
      })
      .catch((error) => {
        throw classifyStorageError(error);
      });
    return NextResponse.json({ ok: true, feedback });
  } catch (error) {
    console.error("POST /api/feedback failed", error);
    const response = publicError(isAppError(error) ? error : error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
