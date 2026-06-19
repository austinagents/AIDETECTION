import { NextResponse } from "next/server";
import { LOCAL_USER_ID } from "@/lib/constants";
import { getStorage } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const analyses = await getStorage().listAnalyses(LOCAL_USER_ID);
    return NextResponse.json({ analyses });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load history." }, { status: 500 });
  }
}
