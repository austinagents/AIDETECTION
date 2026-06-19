import { NextResponse } from "next/server";
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
      return NextResponse.json({ error: "Add a longer writing sample so the profile has enough signal." }, { status: 400 });
    }

    const storage = getStorage();
    const sample = await storage.addWritingSample({ userId: LOCAL_USER_ID, title, content, contentType });
    const [samples, current] = await Promise.all([
      storage.listWritingSamples(LOCAL_USER_ID),
      storage.getStyleProfile(LOCAL_USER_ID)
    ]);
    const profile = await updateStyleProfile(samples, current?.profile ?? null);
    const profileRecord = await storage.upsertStyleProfile(LOCAL_USER_ID, profile, samples.length);

    return NextResponse.json({ sample, profile: profileRecord.profile, sampleCount: profileRecord.sampleCount });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save sample." }, { status: 500 });
  }
}
