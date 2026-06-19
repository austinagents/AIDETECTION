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
}) {
  const client = getOpenAIClient();
  if (!client) {
    return {
      revisedText: localRevision(input.paragraph, input.revisionType),
      explanation: "Local preview suggestion. Add an OpenAI API key for deeper style-aware revision."
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
            "You provide explainable writing revision suggestions. Do not make evasion-related claims. Preserve meaning. Return strict JSON only."
        },
        {
          role: "user",
          content: `Revise this paragraph according to the request.

Request: ${input.revisionType}
Style profile: ${input.styleProfile ? JSON.stringify(input.styleProfile) : "No profile available"}
Paragraph: ${input.paragraph}

Return:
{
  "revisedText": string,
  "explanation": string
}`
        }
      ]
    });

    try {
      return extractJson<{ revisedText: string; explanation: string }>(response.choices[0]?.message?.content ?? "{}");
    } catch {
      return {
        revisedText: localRevision(input.paragraph, input.revisionType),
        explanation: "The model response could not be parsed, so this is a local preview suggestion."
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
    improve: "Consider a more direct version with one concrete detail:",
    specific: "Add a named example, moment, number, or constraint:",
    profile: "Adjust the rhythm and wording toward your saved profile:",
    generic: "Replace broad phrasing with plainer, more owned language:"
  };
  return `${prefix[revisionType]} ${paragraph}`;
}
