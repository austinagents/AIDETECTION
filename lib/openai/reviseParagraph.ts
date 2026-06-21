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
  previousParagraphText?: string;
  nextParagraphText?: string;
  priorContextText?: string;
  detectorWindowText?: string;
  evaluatorFeedback?: {
    remainingHumanEvidenceMissing?: string[];
    remainingAIEvidencePresent?: string[];
    priorRevision?: string;
  };
  preserveWordCount?: {
    originalWordCount: number;
    previousRevisedWordCount?: number;
    minWordCount?: number;
    maxWordCount?: number;
  };
  validationFeedback?: string;
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
          content: `You are revising one paragraph inside an essay to reduce AI detector risk.

Commercial AI detectors often evaluate sentence-level writing in surrounding context, not only isolated paragraphs. Revise the current paragraph so it reduces AI detection risk within this local detector window.

Request: ${input.revisionType}
Content type: ${contentType}
Style profile: ${input.styleProfile ? JSON.stringify(input.styleProfile) : "No profile available"}
Evaluator feedback from prior attempt: ${input.evaluatorFeedback ? JSON.stringify(input.evaluatorFeedback) : "None"}
Validation feedback from prior attempt: ${input.validationFeedback ?? "None"}
Word count requirement: ${
            input.preserveWordCount
              ? `The revised paragraph must be between ${input.preserveWordCount.minWordCount ?? input.preserveWordCount.originalWordCount} and ${
                  input.preserveWordCount.maxWordCount ?? Math.ceil(input.preserveWordCount.originalWordCount * 1.3)
                } words. The original paragraph was ${input.preserveWordCount.originalWordCount} words. The previous revision was ${
                  input.preserveWordCount.previousRevisedWordCount ?? "not counted"
                } words. Preserve semantic coverage and stay within the target length range.`
              : "Keep the revised paragraph within 95% to 130% of the original paragraph word count."
          }
Previous paragraph:
${input.previousParagraphText?.trim() || "[No previous paragraph]"}

Current paragraph:
${input.paragraph}

Next paragraph:
${input.nextParagraphText?.trim() || "[No next paragraph]"}

Prior revised context:
${input.priorContextText?.trim() || "[No prior revised context]"}

Detector window text:
${input.detectorWindowText?.trim() || input.paragraph}

Your job is not to summarize, shorten, simplify, or improve readability.
Your job is to preserve the paragraph's full meaning while transforming paragraph architecture to remove common AI writing tells.

Core revision priority order:
1. Preserve all original meaning.
2. Preserve all claims, examples, facts, and supporting details.
3. Preserve length within 95% to 130% of the original paragraph word count.
4. Transform paragraph architecture to remove AI detector fingerprints.
5. Keep essay-appropriate tone.
6. Avoid banned punctuation and style patterns.

Content preservation is higher priority than detector-risk reduction. Transform the paragraph architecture. Do not reduce the paragraph.

Hard requirements:
- Preserve every major idea from the original paragraph.
- Preserve every example, fact, claim, and explanation.
- Keep revised word count between 95% and 130% of the original.
- Do not use em dashes.
- Do not use hyphenated word compounds.
- Do not use generic AI essay phrasing.
- Do not write like a textbook, consultant report, research summary, or institutional overview.
- Keep the tone appropriate for an essay.
- Do not make the writing casual, childish, poetic, or dramatic.
- Rewrite the paragraph as a competent human essay paragraph.
- Do not automatically preserve sentence count, sentence order, explanation order, paragraph opening style, or paragraph ending style.
- Change paragraph movement when possible while preserving meaning.
- Do not restart the topic if the previous context already introduced it.
- Do not repeat the same opening style used in surrounding paragraphs.
- Do not repeat the same ending style used in surrounding paragraphs.
- Do not use the same transition rhythm as surrounding paragraphs.
- Connect naturally to the previous paragraph and prepare for the next one.
- Vary sentence length and structure inside the detector window.
- Reduce predictability and repeated cadence across the detector window.

Remove or reduce these AI tells when present:
- overly formal tone
- repetitive sentence patterns
- textbook cadence
- generic essay openings
- professionalized academic phrasing
- claim to explanation to significance loops
- balanced three-part lists
- abstract noun stacking
- smooth certainty
- generic expert voice
- predictable transitions
- over-explanation
- robotic completeness
- low variation in sentence rhythm
- repeated cadence across nearby paragraphs
- vague attribution
- promotional or inflated wording
- AI-style filler phrases

Architecture rules:
- Do not treat wording as the primary fingerprint. Paragraph structure is the primary fingerprint.
- Do not preserve the original architecture just because it is coherent.
- Do not automatically preserve a broad opening, an explanatory middle, or a significance ending.
- If the original uses a broad claim first, consider starting with a concrete detail, example, consequence, problem, or specific observation.
- If the original ends with a universal or generic significance statement, end instead on evidence, consequence, observation, or a natural transition when possible.
- Vary sentence count when possible while staying within the word-count range.

Avoid these paragraph movements:
- broad claim to explanation to example to significance
- historical topic sentence to context to explanation to list to conclusion
- define to explain to broaden to universalize
- topic sentence to support to significance

Allowed replacement movements:
- example to explanation to broader point
- historical detail to consequence to interpretation
- contrast to explanation to resolution
- question or problem to evidence to answer
- specific observation to expansion to conclusion
- fact to implication to supporting detail

Document-level variation:
- Do not repeatedly choose the same paragraph architecture.
- Reduce document-wide repetition by making this paragraph move differently from a standard textbook overview.

Openings to avoid:
- "X is one of..."
- "To understand X..."
- "As societies developed..."
- "This demonstrates..."
- "These narratives reveal..."
- "Such stories reflect..."
- Do not replace these with equivalent textbook openings.

Endings to avoid:
- universal conclusions
- broad importance statements
- omniscient summary sentences
- generic significance endings

Banned output patterns:
- Never use the em dash character.
- Never use hyphenated word compounds or two-word compounds joined by a hyphen.
- Do not write phrases like AI-generated, AI-native, human-written, detector-friendly, textbook-like, well-known, up-to-date, context-aware, or student-sounding. Use normal wording instead.

If validation feedback is provided, repair exactly those failures while preserving every original idea.

Return concise notes. What Changed should describe detector-fingerprint removal, not writing-quality improvement. Remaining Issues should mention only unresolved AI tells.

Return:
{
  "revisedText": string,
  "whatChanged": string[],
  "remainingIssues": string[]
}`
        }
      ]
    });

    try {
      const parsed = extractJson<{
        revisedText: string;
        explanation?: string;
        changes?: string[];
        whatChanged?: string[];
        remainingIssues?: string[];
      }>(response.choices[0]?.message?.content ?? "{}");
      const changes = parsed.whatChanged ?? parsed.changes;
      return {
        revisedText: parsed.revisedText,
        explanation: parsed.explanation ?? normalizeList(changes).join(" "),
        changes: normalizeChanges(changes, parsed.explanation ?? ""),
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
