import { NextResponse } from "next/server";
import { LOCAL_USER_ID } from "@/lib/constants";
import { reviseParagraph, RevisionType } from "@/lib/openai/reviseParagraph";
import { getStorage } from "@/lib/storage";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const paragraph = String(body.paragraph || "");
    const revisionType = (body.revisionType || "improve") as RevisionType;
    const analysisId = String(body.analysisId || "");
    const paragraphIndex = Number(body.paragraphIndex ?? 0);

    if (!paragraph.trim()) return NextResponse.json({ error: "Choose a paragraph to revise." }, { status: 400 });

    const storage = getStorage();
    const profile = await storage.getStyleProfile(LOCAL_USER_ID);
    const revision = await reviseParagraph({ paragraph, revisionType, styleProfile: profile?.profile ?? null });
    if (analysisId) {
      await storage.createRevision({
        analysisId,
        paragraphIndex,
        originalText: paragraph,
        revisedText: revision.revisedText,
        revisionType
      });
    }
    return NextResponse.json(revision);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not revise paragraph." }, { status: 500 });
  }
}
