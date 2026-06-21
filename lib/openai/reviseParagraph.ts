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
          content: `You are a professional essay editor.

Your job is editorial reconstruction, not paraphrasing.

Rewrite one paragraph so it sounds like a strong college student wrote it naturally inside an essay.

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
  const originalWordCount = input.preserveWordCount?.originalWordCount ?? countWords(input.paragraph);
  const softLengthGuidance =
    originalWordCount > 0
      ? `The original paragraph is about ${originalWordCount} words. Preserve the amount of information, but do not force exact length. The revised paragraph may be shorter or longer if that creates a stronger paragraph.`
      : "Preserve the amount of information, but do not force exact length.";

  return `Revise one paragraph inside a ${contentType.toLowerCase()}.

This is NOT a paraphrase task.

This is an editorial reconstruction task.

Before writing, silently determine:
1. What the paragraph is about.
2. Why the paragraph exists.
3. What job it performs in the document.
4. How it follows the previous paragraph.
5. How it leads toward the next paragraph.

Then rebuild the paragraph from scratch.

TARGET WRITER:
A strong college student writing their own essay.

The revision should be:
- clear
- organized
- natural
- academically appropriate
- specific
- readable

The revision should NOT sound like:
- a textbook
- an encyclopedia
- a corporate report
- an academic journal
- an AI educational article
- a blog post
- a social media post
- casual conversation
- a personal diary

PRIMARY RULE:
Preserve meaning.
Do not preserve structure.

Preserve:
- meaning
- facts
- examples
- citations
- named entities
- dates
- statistics
- paragraph role
- document continuity

Actively change:
- sentence structure
- sentence order
- information order when possible
- paragraph movement
- original opening
- original ending
- transition style
- explanation order

If the revised paragraph follows the same sentence order, same information order, and same paragraph movement as the original, it failed.

A successful revision should NOT be explainable as:
"the original paragraph with different wording."

A successful revision should be:
"the same idea communicated in a stronger, more natural paragraph."

PARAGRAPH ROLE:
Preserve the paragraph's job in the essay.

The paragraph may:
- introduce a topic
- define a term
- explain a cause
- give an example
- expand an argument
- compare ideas
- transition to the next section
- conclude a section

Preserve the job.
Do not preserve the original structure used to perform the job.

DOCUMENT CONTINUITY:
Use previous and next paragraphs only for flow and placement.

The revised paragraph must:
- fit naturally after the previous paragraph
- lead naturally toward the next paragraph
- preserve topic progression
- preserve argument progression

Do not borrow facts, names, examples, or subject matter from neighboring paragraphs unless they already appear in the current paragraph.

INFORMATION DENSITY:
Do not rewrite only to say the same thing differently.

Improve at least one of:
- clarity
- specificity
- concreteness
- organization
- readability
- flow
- naturalness

OPENINGS:
Prefer openings based on:
- concrete observation
- specific example
- practical consequence
- direct explanation
- continuation from the previous idea
- named event or object when relevant

Avoid generic openings such as:
- X is one of...
- To understand...
- Throughout history...
- Many scholars argue...
- Since ancient times...
- In modern society...
- It is important to note...

ENDINGS:
Do not force broad significance endings.

Avoid endings such as:
- This demonstrates...
- This reveals...
- This highlights...
- This illustrates...
- This ultimately shows...
- This remains important because...

Not every paragraph needs a formal conclusion.
Some paragraphs should end with an observation, example, consequence, specific detail, or bridge into the next idea.

STYLE:
- Vary sentence rhythm naturally.
- Avoid unnecessary stacked lists.
- Avoid excessive certainty.
- Prefer concrete language when it preserves accuracy.
- Do not mechanically replace abstract words.
- ${softLengthGuidance}
- Never use em dashes.
- Do not use validation, preservation, anchor, or process language inside revisedText.

FORBIDDEN INSIDE revisedText:
- Examples such as
- remain part of the discussion
- remains included
- preserved in the revision
- anchors
- subject matter preserved
- this paragraph still discusses
- the revision preserves
- key examples remain
- included naturally

Previous paragraph:
${input.previousParagraphText?.trim() || "[No previous paragraph]"}

Current paragraph:
${input.paragraph.trim()}

Next paragraph:
${input.nextParagraphText?.trim() || "[No next paragraph]"}

Prior revised context:
${input.priorContextText?.trim() || "[No prior revised context]"}

Important current paragraph anchors:
${input.subjectAnchors?.length ? input.subjectAnchors.join(", ") : "[No extracted anchors]"}

Neighboring paragraph names or topics that must not become source material:
${input.forbiddenContextAnchors?.length ? input.forbiddenContextAnchors.join(", ") : "[None]"}

Evaluator feedback from prior attempt:
${input.evaluatorFeedback ? JSON.stringify(input.evaluatorFeedback) : "None"}

Validation feedback from prior attempt:
${input.validationFeedback ?? "None"}

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
