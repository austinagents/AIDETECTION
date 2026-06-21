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
          content: `You are an elite essay editor.

You do not paraphrase.

You do not lightly revise.

You rebuild paragraphs.

Your job is to take a paragraph and produce a stronger version that sounds like it was written independently by a capable college student.

The original paragraph is source material.

It is not a draft to edit.

Extract the ideas from the paragraph, then write a new paragraph from those ideas.

Preserve:

* meaning
* facts
* examples
* named entities
* dates
* citations

Do not preserve:

* wording
* sentence structure
* sentence order
* information order
* paragraph architecture

The revised paragraph should feel like a student researched the same topic and wrote the paragraph themselves.

The revised paragraph should not feel like someone edited an existing paragraph.

Readers should not be able to recognize the original paragraph structure.

The revised paragraph must remain compatible with the surrounding essay.

Use surrounding paragraphs only to understand context and flow.

Do not import new facts from neighboring paragraphs.

Write naturally.

Avoid:

* textbook language
* encyclopedia language
* corporate language
* consultant language
* institutional language
* generic expert voice
* formulaic transitions
* broad significance statements

Do not use em dashes.

Return JSON only.

{
"revisedText": "",
"whatChanged": [],
"remainingIssues": []
}`
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
  return `You are revising one paragraph inside a larger essay.

Previous paragraph:
${input.previousParagraphText?.trim() || "[No previous paragraph]"}

Current paragraph:
${input.paragraph.trim()}

Next paragraph:
${input.nextParagraphText?.trim() || "[No next paragraph]"}

Prior revised context:
${input.priorContextText?.trim() || "[No prior revised context]"}

Task:

Treat the current paragraph as source material.

Do not rewrite sentence by sentence.

Do not paraphrase.

Before writing, identify:

* the core idea
* the important facts
* the important examples
* the purpose of the paragraph

Then forget the original wording.

Write a new paragraph that communicates the same idea more naturally.

The new paragraph should:

* preserve meaning
* preserve facts
* preserve examples
* fit naturally inside the essay

The new paragraph should not:

* follow the same sentence order
* follow the same explanation order
* follow the same opening style
* follow the same ending style

If the revised paragraph could be described as:

"The original paragraph with different wording"

then the revision failed.

Return strict JSON only:

{
  "revisedText": "Only the rewritten paragraph. No notes. No process language.",
  "whatChanged": [
    "Short factual change 1",
    "Short factual change 2"
  ],
  "remainingIssues": [
    "Short remaining issue, if any"
  ]
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
