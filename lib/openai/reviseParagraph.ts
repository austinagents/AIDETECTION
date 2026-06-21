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
  subjectAnchors?: string[];
  forbiddenContextAnchors?: string[];
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
      revisedText: cleanupRevisedText(localRevision(input.paragraph, contentType)),
      explanation: "OpenAI unavailable. Returning original paragraph.",
      changes: ["No model revision available"],
      remainingIssues: ["OpenAI unavailable"]
    };
  }

  try {
    const response = await client.chat.completions.create({
      model: OPENAI_MODEL,
      response_format: { type: "json_object" },
      temperature: 0.7,
      messages: [
        {
          role: "system",
          content: `You are rewriting one paragraph for a college student essay.

Do not act like a professional editor.

Do not polish the paragraph into textbook language.

Do not paraphrase the original paragraph.

Treat the original paragraph as notes about what the student wants to say.

Write a new paragraph in the voice of a normal college student who understands the topic and is explaining it in their own words.

The paragraph should be clear and appropriate for college work, but it should not sound professional, institutional, or overly polished.

Do not use em dashes.

Return strict JSON only.`
        },
        {
          role: "user",
          content: buildRevisionPrompt(input, contentType)
        }
      ]
    });

    try {
      const parsed = extractJson<{
        revisedText?: string;
        explanation?: string;
        changes?: string[];
        whatChanged?: string[];
        remainingIssues?: string[];
      }>(response.choices[0]?.message?.content ?? "{}");

      const revisedText = cleanupRevisedText(parsed.revisedText || localRevision(input.paragraph, contentType));
      const changes = parsed.whatChanged ?? parsed.changes;

      return {
        revisedText,
        explanation: parsed.explanation ?? normalizeList(changes).join(" "),
        changes: normalizeChanges(changes, parsed.explanation ?? ""),
        remainingIssues: normalizeRemainingIssues(parsed.remainingIssues).slice(0, 5)
      };
    } catch {
      return {
        revisedText: cleanupRevisedText(localRevision(input.paragraph, contentType)),
        explanation: "The model response could not be parsed. Returning original paragraph.",
        changes: ["No parsed model revision available"],
        remainingIssues: ["Model response could not be parsed"]
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

function buildRevisionPrompt(
  input: Parameters<typeof reviseParagraph>[0],
  contentType: ContentType
) {
  return `You are given one paragraph from a larger essay.

Current paragraph:

${input.paragraph}

Previous paragraph:

${input.previousParagraphText || "[None]"}

Next paragraph:

${input.nextParagraphText || "[None]"}

Rewrite the current paragraph.

Important:

The original paragraph is not a draft to edit.

It is only source material.

Use the ideas, facts, examples, names, dates, and meaning from the paragraph, but do not follow its wording or structure.

Write the paragraph as if a normal college student understood the idea and wrote it themselves.

The result should sound like student-authored writing, not professional writing.

It should not sound like:

* a textbook
* an encyclopedia
* an academic article
* a consultant report
* an AI explanation
* a polished summary

Avoid broad academic openings.

Do not start with phrases like:

* Mythology is
* Mythology stands
* The origins of
* The development of
* The transition from
* In prehistoric times
* Before the rise of
* Throughout history
* To understand
* Many scholars argue
* X played a crucial role
* X served as
* X represents

Prefer a plain, direct opening that a student would naturally choose.

Examples of the right style:

* People were telling stories before they had writing.
* Early people did not have clear explanations for storms, death, or failed crops.
* A sound in the grass could matter.
* A failed harvest needed an explanation.
* Some myths began with ordinary fears.
* Stories helped people explain what they could not control.

Do not copy those examples unless they fit naturally.

The new paragraph should:

* keep the same meaning
* keep important facts
* keep important examples
* keep named entities
* fit with the previous and next paragraph
* use plain student wording
* vary sentence length naturally

The new paragraph should not:

* follow the same sentence order
* follow the same explanation order
* use the same first sentence strategy
* use the same ending strategy
* sound more impressive than the original
* use broad significance language

Avoid words and phrases that create textbook voice:

* fundamental
* framework
* universal
* significant
* deeply connected
* closely linked
* shaped human understanding
* cultural achievement
* natural phenomena
* formal systems
* profound themes
* demonstrates
* reveals
* highlights
* illustrates
* ultimately shows

Do not use em dashes.

Return JSON only:

{
  "revisedText": "Only the rewritten paragraph.",
  "whatChanged": ["Short factual change 1", "Short factual change 2"],
  "remainingIssues": ["Short remaining issue, if any"]
}`;
}

function cleanupRevisedText(text: string) {
  let cleaned = text.trim();

  cleaned = cleaned.replace(/—/g, ",");
  cleaned = cleaned.replace(/–/g, "-");

  const forbiddenSentencePatterns = [
    /\bExamples such as\b[^.?!]*(?:remain|remains|included|discussion)[^.?!]*[.?!]/gi,
    /\b[^.?!]*(?:remain|remains) part of the discussion[^.?!]*[.?!]/gi,
    /\b[^.?!]*preserved in the revision[^.?!]*[.?!]/gi,
    /\b[^.?!]*subject matter preserved[^.?!]*[.?!]/gi,
    /\b[^.?!]*this paragraph still discusses[^.?!]*[.?!]/gi,
    /\b[^.?!]*the revision preserves[^.?!]*[.?!]/gi,
    /\b[^.?!]*key examples remain[^.?!]*[.?!]/gi,
    /\b[^.?!]*included naturally[^.?!]*[.?!]/gi,
    /\b[^.?!]*anchors?[^.?!]*[.?!]/gi
  ];

  for (const pattern of forbiddenSentencePatterns) {
    cleaned = cleaned.replace(pattern, " ");
  }

  cleaned = cleaned
    .replace(/\s+/g, " ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .trim();

  return cleaned;
}

function localRevision(paragraph: string, _contentType: ContentType) {
  return paragraph;
}

function normalizeList(items: string[] | undefined) {
  return Array.isArray(items) ? items.map((item) => item.trim()).filter(Boolean) : [];
}

function normalizeRemainingIssues(items: string[] | undefined) {
  const blocked = /\b(personal voice|creativ|surprise|original|engaging|stronger hook)\b/i;
  return normalizeList(items).filter((item) => !blocked.test(item));
}

function normalizeChanges(changes: string[] | undefined, explanation: string) {
  const blocked = /\b(more conversational|added insight|more engaging)\b/i;

  if (Array.isArray(changes) && changes.length) {
    const normalized = changes
      .map((change) => change.trim())
      .filter((change) => change && !blocked.test(change))
      .slice(0, 5);

    return normalized.length ? normalized : ["Rebuilt the paragraph instead of paraphrasing sentence by sentence"];
  }

  const normalized = explanation
    .split(/[.;]\s+/)
    .map((item) => item.trim())
    .filter((item) => item && !blocked.test(item))
    .slice(0, 5);

  return normalized.length ? normalized : ["Rebuilt the paragraph instead of paraphrasing sentence by sentence"];
}

function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
