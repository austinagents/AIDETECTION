import { AppError, safeDetails } from "@/lib/api/errors";
import { StyleProfile } from "@/lib/types";
import { getOpenAIClient } from "./client";
import { extractJson } from "./json";
import { OPENAI_MODEL } from "./model";

export type RevisionType = "improve" | "specific" | "profile" | "generic";

export async function reviseParagraph(input: {
  paragraph: string;
  revisionType: RevisionType;
  styleProfile?: StyleProfile | null;
  evaluatorFeedback?: {
    remainingHumanEvidenceMissing?: string[];
    remainingAIEvidencePresent?: string[];
    priorRevision?: string;
  };
}) {
  const client = getOpenAIClient();
  if (!client) {
    return {
      revisedText: localRevision(input.paragraph, input.revisionType),
      explanation: "Local preview suggestion. Add an OpenAI API key for deeper style-aware revision.",
      changes: ["Added clearer authorial judgment", "Increased specificity", "Improved sentence flow"],
      remainingIssues: ["Needs stronger evidence from the full authorship model"]
    };
  }

  try {
    const response = await client.chat.completions.create({
      model: OPENAI_MODEL,
      response_format: { type: "json_object" },
      temperature: 0.35,
      messages: [
        {
          role: "system",
          content:
            "You are an authorship evidence optimizer. Improve paragraphs by increasing Human Authorship Evidence and decreasing AI Authorship Evidence. This is not a grammar, quality, or readability task. Do not make evasion-related claims. Preserve meaning, factual boundaries, and user intent. Return strict JSON only."
        },
        {
          role: "user",
          content: `Revise this paragraph according to the request.

Request: ${input.revisionType}
Style profile: ${input.styleProfile ? JSON.stringify(input.styleProfile) : "No profile available"}
Evaluator feedback from prior attempt: ${input.evaluatorFeedback ? JSON.stringify(input.evaluatorFeedback) : "None"}
Paragraph: ${input.paragraph}

If the request is "improve", follow this process internally:
1. Analyze the paragraph for Human Authorship Evidence and AI Authorship Evidence.
2. Identify the strongest weaknesses.
3. Build a rewrite strategy that reduces generic framing, professionalized writing bias, flat summary tone, predictable structure, low specificity, over-balanced flow, textbook cadence, artificial insight framing, and consultant/report-style phrasing when present.
4. Increase authorial judgment, specificity, information hierarchy, voice ownership, information compression, surprise/contrast, sentence variation, and natural flow.
5. Preserve meaning, factual boundaries, and user intent.
6. Do not preserve structure if a stronger structure is available.
7. Do not merely replace synonyms.
8. Restructure aggressively when beneficial.
9. If evaluator feedback is provided, use it to produce a stronger attempt.
10. Do not optimize for personal voice unless a writing profile is available.
11. If a writing profile is available, optionally improve voice match, tone match, vocabulary match, rhythm match, and structure match as a separate profile layer.

Hard revision rules:
- Never use em dashes.
- Avoid repeated hyphenated compound constructions.
- Do not use formulaic contrast templates such as "It is not X. It is Y", "This is not about X. It is about Y", "The real issue is not X, but Y", "Not because of X, but because of Y", or "This was not merely X. It was Y".
- Avoid generic depth framing such as "At its core", "On a deeper level", "The true significance", and similar artificial insight markers.
- Avoid generic institutional framing such as "This highlights", "This demonstrates", "This underscores", "This provides insight into", and similar study/report moves unless the source context clearly requires them.
- Prefer normal human phrasing, direct explanations, concrete but not theatrical examples, natural sentence rhythm, less polished structure, fewer abstract nouns, fewer three-part lists, and fewer professional-report constructions.
- Do not make the revision poetic, theatrical, overly vivid, or too neatly framed.

Do not explain this internal process to the user. Return the strongest revision and concise evidence-based notes.

Return:
{
  "revisedText": string,
  "explanation": string,
  "changes": string[],
  "remainingIssues": string[]
}`
        }
      ]
    });

    try {
      const parsed = extractJson<{ revisedText: string; explanation: string; changes?: string[]; remainingIssues?: string[] }>(response.choices[0]?.message?.content ?? "{}");
      return {
        revisedText: parsed.revisedText,
        explanation: parsed.explanation,
        changes: normalizeChanges(parsed.changes, parsed.explanation),
        remainingIssues: normalizeList(parsed.remainingIssues).slice(0, 5)
      };
    } catch {
      return {
        revisedText: localRevision(input.paragraph, input.revisionType),
        explanation: "The model response could not be parsed, so this is a local preview suggestion.",
        changes: ["Added clearer authorial judgment", "Increased specificity", "Improved sentence flow"],
        remainingIssues: ["Needs stronger evidence from the full authorship model"]
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new AppError(
      "OPENAI_ERROR",
      "OpenAI paragraph revision failed. Check that OPENAI_API_KEY is valid and the configured model is available.",
      502,
      safeDetails(message)
    );
  }
}

function localRevision(paragraph: string, revisionType: RevisionType) {
  const prefix: Record<RevisionType, string> = {
    improve: "Consider a version with stronger authorial judgment, more specific grounding, and more natural rhythm:",
    specific: "Add a named example, moment, number, or constraint:",
    profile: "Adjust the rhythm and wording toward your saved profile:",
    generic: "Replace broad phrasing with plainer, more owned language:"
  };
  return `${prefix[revisionType]} ${paragraph}`;
}

function normalizeList(items: string[] | undefined) {
  return Array.isArray(items) ? items.map((item) => item.trim()).filter(Boolean) : [];
}

function normalizeChanges(changes: string[] | undefined, explanation: string) {
  if (Array.isArray(changes) && changes.length) {
    return changes.map((change) => change.trim()).filter(Boolean).slice(0, 5);
  }

  return explanation
    .split(/[.;]\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 5);
}
