import { NextResponse } from "next/server";
import { LOCAL_USER_ID } from "@/lib/constants";
import { getStorage } from "@/lib/storage";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  try {
    const analysis = await getStorage().getAnalysis(LOCAL_USER_ID, params.id);
    if (!analysis) return NextResponse.json({ error: "Analysis not found." }, { status: 404 });
    return NextResponse.json({ analysis });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load analysis." }, { status: 500 });
  }
}
