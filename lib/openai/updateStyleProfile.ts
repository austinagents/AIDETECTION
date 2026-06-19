import { emptyStyleProfile } from "@/lib/constants";
import { StyleProfile, WritingSample } from "@/lib/types";
import { getOpenAIClient } from "./client";
import { extractJson } from "./json";

export async function updateStyleProfile(samples: WritingSample[], currentProfile?: StyleProfile | null): Promise<StyleProfile> {
  const client = getOpenAIClient();
  if (!client) return heuristicProfile(samples);

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    temperature: 0.25,
    messages: [
      {
        role: "system",
        content:
          "You analyze a user's saved writing samples to maintain a personal writing style profile. Do not discuss bypassing detection. Return strict JSON only."
      },
      {
        role: "user",
        content: `Update this writing style profile using the saved samples. Preserve useful existing observations, but revise them if the new samples show better evidence.

Return exactly:
{
  "tone": string,
  "sentenceLength": string,
  "vocabularyLevel": string,
  "commonPatterns": string[],
  "commonPhrases": string[],
  "punctuationHabits": string[],
  "paragraphStyle": string,
  "strengths": string[],
  "quirks": string[],
  "avoidances": string[],
  "exampleVoiceSummary": string,
  "styleRules": string[]
}

Current profile: ${currentProfile ? JSON.stringify(currentProfile) : "None"}
Samples: ${JSON.stringify(samples.map(({ title, contentType, content }) => ({ title, contentType, content: content.slice(0, 5000) })))}`
      }
    ]
  });

  return { ...emptyStyleProfile, ...extractJson<StyleProfile>(response.choices[0]?.message?.content ?? "{}") };
}

function heuristicProfile(samples: WritingSample[]): StyleProfile {
  const all = samples.map((sample) => sample.content).join("\n\n");
  const words = all.split(/\s+/).filter(Boolean);
  const sentences = all.split(/[.!?]+/).filter((item) => item.trim());
  const avg = words.length / Math.max(1, sentences.length);
  return {
    tone: samples.length ? "Developing from saved samples" : emptyStyleProfile.tone,
    sentenceLength: avg > 22 ? "Longer, developed sentences" : avg > 12 ? "Mixed, readable sentences" : "Short, direct sentences",
    vocabularyLevel: "Natural and context-led",
    commonPatterns: samples.length ? ["Uses examples when the topic allows", "Prefers clear claims before detail"] : [],
    commonPhrases: [],
    punctuationHabits: all.includes(";") ? ["Occasional semicolons"] : ["Mostly simple punctuation"],
    paragraphStyle: samples.length > 1 ? "Short to medium paragraphs with direct topic movement" : "Not enough samples yet",
    strengths: ["Clear baseline for future style matching"],
    quirks: samples.length ? ["Needs more samples for reliable quirks"] : [],
    avoidances: ["Avoid adding generic polish that is not present in the samples"],
    exampleVoiceSummary:
      samples.length ? "The saved samples suggest a practical, direct voice. Add more writing to sharpen this profile." : emptyStyleProfile.exampleVoiceSummary,
    styleRules: [
      "Keep claims specific and grounded.",
      "Prefer natural sentence rhythm over overly even paragraph structure.",
      "Use details that sound owned by the writer."
    ]
  };
}
