import { AppError, safeDetails } from "@/lib/api/errors";
import { ContentType, StyleProfile } from "@/lib/types";
import { getOpenAIClient } from "./client";
import { extractJson } from "./json";
import { OPENAI_REVISION_MODEL } from "./model";

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
  rewriteTargets?: string[];
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
      model: OPENAI_REVISION_MODEL,
      response_format: { type: "json_object" },
      temperature: 0.7,
      messages: [
        {
          role: "system",
          content: `You rewrite college essay paragraphs.

Your goal is to preserve the author's meaning, evidence, facts, examples, named entities, citations, and essay continuity while reducing common AI-writing fingerprints.

Target voice:

A college student who researched the topic and wrote the essay themselves.

Reduce:

- textbook cadence
- professionalized tone
- generic expert voice
- predictable structure
- balanced constructions
- formulaic transitions
- abstract noun density
- smooth certainty
- repetitive explanation patterns

Do not:

- paraphrase sentence by sentence
- summarize
- simplify the ideas
- add new claims
- add new themes
- add interpretation
- add philosophical framing
- add significance statements
- write like a textbook
- write like an encyclopedia
- write like an educational article
- write like a consultant
- write like a professional editor

Write as the original student author expressing the same ideas more naturally.

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
  const minimumWordCount = input.preserveWordCount?.minWordCount ?? input.preserveWordCount?.originalWordCount ?? countWords(input.paragraph);

  return `Rewrite one paragraph from a larger ${contentType.toLowerCase()}.

Current paragraph:

${input.paragraph}

Paragraph-specific detector feedback:

Remaining AI-like evidence:
${input.evaluatorFeedback?.remainingAIEvidencePresent?.length ? input.evaluatorFeedback.remainingAIEvidencePresent.map((item) => `- ${item}`).join("\n") : "- [None provided]"}

Human evidence still missing:
${input.evaluatorFeedback?.remainingHumanEvidenceMissing?.length ? input.evaluatorFeedback.remainingHumanEvidenceMissing.map((item) => `- ${item}`).join("\n") : "- [None provided]"}

Validation feedback:
${input.validationFeedback || "[None provided]"}

Prior failed revision:
${input.evaluatorFeedback?.priorRevision || "[None provided]"}

Detector window:
${input.detectorWindowText || "[None provided]"}

Previous paragraph:

${input.previousParagraphText || "[None]"}

Next paragraph:

${input.nextParagraphText || "[None]"}

Rewrite the current paragraph.

Rewrite the current paragraph to directly reduce the paragraph-specific detector feedback above.

Do not perform a generic rewrite.

The revision must specifically reduce the listed AI-like evidence while preserving the paragraph's meaning, facts, examples, named entities, citations, and continuity.

If prior failed revision is provided, do not repeat its style, structure, phrasing, or failure pattern.

The revised paragraph must be at least as long as the original paragraph.

Original word count:
${originalWordCount}

Minimum revised word count:
${minimumWordCount}

Do not reduce word count by summarizing.

Do not make the paragraph more conversational, casual, simplified, poetic, philosophical, or polished.

Do not produce:
- synonym-swapped paraphrase
- simplified student explainer
- educational article prose
- philosophical narration
- textbook summary

Hard revision rule:

The revised paragraph must be materially different from the original. Do not reuse the original first sentence. Do not reuse the original final sentence. Do not copy full original sentences unless absolutely required for citations or named evidence. Preserve meaning and evidence, but rewrite the prose. A revision that is mostly the original paragraph with punctuation changes, dash cleanup, or synonym swaps has failed.

Word count:

The revised word count must be at least the original word count. Do not meet word count by copying original sentences. Do not pad with generic commentary.

Target:

A college student who researched the topic and wrote this essay themselves.

The paragraph should still feel like an essay paragraph, but with fewer detector-visible patterns.

Attack these patterns when present in the detector feedback:
- broad generic openings
- claim/explanation/significance structure
- balanced lists
- abstract noun stacking
- smooth certainty
- generic expert voice
- textbook cadence
- professionalized academic tone
- repetitive explanation patterns

Preserve:
- meaning
- facts
- examples
- citations
- named entities
- essay flow
- paragraph role

Do not add:
- new claims
- new examples
- new themes
- new philosophical framing
- new significance statements

Important:

The detector feedback is the priority.
A revision that sounds better but leaves the listed detector fingerprints intact is a failed revision.

Primary product goal:

Produce college-appropriate writing that preserves the author's meaning while reducing AI-writing fingerprints.

Success requires both:

- preserve the original meaning and evidence
- reduce patterns commonly associated with AI-generated writing

The target is:

A college student who researched the topic and wrote the essay themselves.

Preserve:

- meaning
- facts
- examples
- named entities
- citations
- essay continuity

Reduce:

- textbook cadence
- professionalized tone
- generic expert voice
- predictable structure
- balanced constructions
- formulaic transitions
- abstract noun density
- smooth certainty
- repetitive explanation patterns
- broad significance statements

Do not:

- summarize
- simplify the ideas
- add interpretation
- add new themes
- add philosophical framing
- add significance statements
- teach the topic to the reader
- explain the topic like an article
- sound more impressive than the original

The revised paragraph should feel like the same student expressing the same ideas more naturally.

The revised paragraph should be at least as long as the original paragraph.

Do not shorten the paragraph through summarization.

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

  cleaned = cleaned.replace(/\s*—\s*/g, ", ");
  cleaned = cleaned.replace(/\s*–\s*/g, "-");

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
