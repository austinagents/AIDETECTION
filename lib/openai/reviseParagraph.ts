import { AppError, safeDetails } from "@/lib/api/errors";
import { ContentType, StyleProfile } from "@/lib/types";
import { getOpenAIClient } from "./client";
import { extractJson } from "./json";
import { OPENAI_MODEL } from "./model";

export type RevisionType = "improve";

export async function reviseParagraph(input: {
  paragraph: string;
  revisionType: RevisionType;
  contentType?: ContentType;
  styleProfile?: StyleProfile | null;
  evaluatorFeedback?: {
    remainingHumanEvidenceMissing?: string[];
    remainingAIEvidencePresent?: string[];
    priorRevision?: string;
  };
  preserveWordCount?: {
    originalWordCount: number;
    previousRevisedWordCount?: number;
  };
}) {
  const client = getOpenAIClient();
  const contentType = input.contentType ?? "Other";
  if (!client) {
    return {
      revisedText: localRevision(input.paragraph, input.revisionType, contentType),
      explanation: "Local preview suggestion. Add an OpenAI API key for deeper style-aware revision.",
      changes: ["Reduced broad AI-style framing", "Used essay-appropriate wording", "Targeted remaining AI-writing fingerprints"],
      remainingIssues: ["May still contain unresolved AI-writing fingerprints"]
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
            "You are an AI-detector risk reducer. Revise paragraphs only to reduce visible AI-writing fingerprints while preserving meaning, factual boundaries, and user intent. This is not a grammar, quality, creativity, originality, polish, voice, or readability task. Do not make evasion-related claims. Return strict JSON only."
        },
        {
          role: "user",
          content: `Revise this paragraph according to the request.

Request: ${input.revisionType}
Content type: ${contentType}
Style profile: ${input.styleProfile ? JSON.stringify(input.styleProfile) : "No profile available"}
Evaluator feedback from prior attempt: ${input.evaluatorFeedback ? JSON.stringify(input.evaluatorFeedback) : "None"}
Word count requirement: ${
            input.preserveWordCount
              ? `The revised paragraph must be at least ${input.preserveWordCount.originalWordCount} words. The previous revision was ${
                  input.preserveWordCount.previousRevisedWordCount ?? "not counted"
                } words. Preserve or increase word count.`
              : "Preserve or increase the original paragraph word count."
          }
Paragraph: ${input.paragraph}

If the request is "improve", follow this process internally:
1. Analyze which detector-style AI fingerprints are present.
2. Identify the strongest risk signals.
3. Build a rewrite strategy that reduces generic framing, professionalized writing bias, flat summary tone, predictable structure, balanced construction, textbook cadence, artificial insight framing, abstract noun density, institutional language, over-explanation, smooth certainty, and consultant/report-style phrasing when present.
4. Reduce detector risk by lowering structure symmetry, textbook cadence, academic polish, abstract framing, generic transitions, and repetitive cadence.
5. Preserve meaning, factual boundaries, and user intent.
6. Do not preserve structure if a stronger structure is available.
7. Do not merely replace synonyms.
8. Restructure aggressively when beneficial.
9. If evaluator feedback is provided, use it to produce a stronger attempt.
10. Do not optimize for personal voice, creativity, originality, insight, or readability.
11. Preserve or increase word count. Do not summarize, condense, shorten, remove supporting details, collapse ideas, or reduce paragraph length. If removing AI-like phrasing reduces words, replace it with concrete, context-appropriate detail.

Essay-specific target:
If Content type is "Essay", the revision must reduce detector risk while keeping an essay-appropriate tone. Keep moderate formality. Do not make it casual, childish, blog-like, poetic, theatrical, corporate, or textbook-like. It should not read like a Wikipedia overview, study abstract, institutional summary, or AI-polished student response.

For Essay revisions, remove these specific AI-authorship fingerprints when present:
- Broad universal openings or grand framing.
- Textbook cadence: broad claim, explanation, significance.
- Predictable essay-template structure.
- Professionalized academic wording such as "served as a framework", "provided meaning and identity", "constructed cultural identity", "transmitted moral values", "underscores the significance", "reflects a broader pattern", "highlights the importance", "demonstrates the role", "within the context of", "deeply intertwined", "universal human desire", "human consciousness", or "the cosmos".
- Abstract concept clusters such as life, death, nature, existence, identity, society, morality, humanity, consciousness, and understanding when stacked together.
- Omniscient narrator claims that explain all people, all cultures, or all history too smoothly.

Do not treat the revision as successful just because it is simpler, shorter, clearer, more conversational, or has changed enough words. It is successful only if the major detector risk signals are materially reduced while preserving meaning and essay-appropriate tone.

Hard revision rules:
- Never use em dashes.
- Avoid repeated hyphenated compound constructions.
- Do not use formulaic contrast templates such as "It is not X. It is Y", "This is not about X. It is about Y", "The real issue is not X, but Y", "Not because of X, but because of Y", or "This was not merely X. It was Y".
- Avoid generic depth framing such as "At its core", "On a deeper level", "The true significance", and similar artificial insight markers.
- Avoid generic institutional framing such as "This highlights", "This demonstrates", "This underscores", "This provides insight into", and similar study/report moves unless the source context clearly requires them.
- Prefer normal human phrasing, direct explanations, concrete but not theatrical examples, natural sentence rhythm, less polished structure, fewer abstract nouns, fewer three-part lists, and fewer professional-report constructions.
- Do not make the revision poetic, theatrical, overly vivid, or too neatly framed.
- Do not force surprise, creativity, personal voice, dramatic examples, polished academic interpretation, or fake insight.
- A simple average paragraph is acceptable if it sounds naturally human and avoids major AI-writing fingerprints.
- The revised paragraph must preserve or increase word count. Do not shorten the paragraph.

What Changed must describe AI-fingerprint reduction, not writing-quality improvement. Good examples: "Removed broad textbook-style opening", "Replaced inflated academic phrasing with normal essay language", "Reduced abstract noun stacking", "Broke the predictable claim/explanation/significance structure", "Removed professionalized report-style phrasing", "Kept the paragraph formal enough for an essay without sounding institutional".

Remaining Issues must only mention unresolved AI fingerprints. Do not mention needing more personal voice, creativity, insight, surprise, originality, engagement, or a stronger hook.

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
        remainingIssues: normalizeRemainingIssues(parsed.remainingIssues).slice(0, 5)
      };
    } catch {
      return {
        revisedText: localRevision(input.paragraph, input.revisionType, contentType),
        explanation: "The model response could not be parsed, so this is a local preview suggestion.",
        changes: ["Reduced broad AI-style framing", "Used essay-appropriate wording", "Targeted remaining AI-writing fingerprints"],
        remainingIssues: ["May still contain unresolved AI-writing fingerprints"]
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

function localRevision(paragraph: string, revisionType: RevisionType, contentType: ContentType) {
  const improvePrefix =
    contentType === "Essay"
      ? "Consider a version that keeps an essay tone while reducing textbook-style AI fingerprints:"
      : "Consider a version that reduces visible AI-writing fingerprints:";
  return `${improvePrefix} ${paragraph}`;
}

function normalizeList(items: string[] | undefined) {
  return Array.isArray(items) ? items.map((item) => item.trim()).filter(Boolean) : [];
}

function normalizeRemainingIssues(items: string[] | undefined) {
  const blocked = /\b(personal voice|creativ|insight|surprise|original|engaging|stronger hook|readability|clarity)\b/i;
  return normalizeList(items).filter((item) => !blocked.test(item));
}

function normalizeChanges(changes: string[] | undefined, explanation: string) {
  const blocked = /\b(improved readability|enhanced clarity|more conversational|strengthened voice|added insight|more engaging)\b/i;
  if (Array.isArray(changes) && changes.length) {
    const normalized = changes.map((change) => change.trim()).filter((change) => change && !blocked.test(change)).slice(0, 5);
    return normalized.length ? normalized : ["Reduced visible AI-writing fingerprints"];
  }

  const normalized = explanation
    .split(/[.;]\s+/)
    .map((item) => item.trim())
    .filter((item) => item && !blocked.test(item))
    .slice(0, 5);
  return normalized.length ? normalized : ["Reduced visible AI-writing fingerprints"];
}
