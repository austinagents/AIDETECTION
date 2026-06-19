import { NextResponse } from "next/server";
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
      return NextResponse.json({ error: "Add at least a short paragraph before running analysis." }, { status: 400 });
    }

    const storage = getStorage();
    const profile = useProfile ? await storage.getStyleProfile(LOCAL_USER_ID) : null;
    const result = await analyzeWriting({
      title,
      content,
      contentType,
      styleProfile: profile?.profile ?? null
    });
    const analysis = await storage.createAnalysis({
      userId: LOCAL_USER_ID,
      title,
      originalText: content,
      contentType,
      result
    });

    return NextResponse.json({ analysis });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Analysis failed." }, { status: 500 });
  }
}
