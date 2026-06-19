import { NextResponse } from "next/server";
import { LOCAL_USER_ID } from "@/lib/constants";
import { getStorage } from "@/lib/storage";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const feedback = await getStorage().createFeedback({
      analysisId: String(body.analysisId || ""),
      userId: LOCAL_USER_ID,
      userRating: Number(body.userRating || 0),
      notes: body.notes ? String(body.notes) : undefined,
      outcomeLabel: body.outcomeLabel
    });
    return NextResponse.json({ feedback });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save feedback." }, { status: 500 });
  }
}
