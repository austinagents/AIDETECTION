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
            "You are a professional essay editor. Rebuild paragraphs for a strong college student voice while preserving meaning, facts, examples, named entities, dates, citations, and the paragraph's role in the essay. Do not paraphrase line by line. Return strict JSON only."
        },
        {
          role: "user",
          content: `Revise one paragraph inside an essay.

Treat this as editorial reconstruction, not paraphrasing. First infer what the paragraph is about, why it exists, what role it serves, and how it fits between the previous and next paragraphs. Then write a new paragraph as if the original wording and sentence order did not exist.

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

Current paragraph factual anchors:
${input.subjectAnchors?.length ? input.subjectAnchors.join(", ") : "[No extracted anchors]"}

Neighboring paragraph names or topics that should not become source material:
${input.forbiddenContextAnchors?.length ? input.forbiddenContextAnchors.join(", ") : "[None]"}

Primary goal:
Reconstruct the paragraph so it reads like a competent college student wrote it for an essay. It should be clear, organized, natural, academically appropriate, specific, and readable. Do not make it sound like a textbook, encyclopedia, corporate report, academic journal, blog post, social post, casual conversation, or diary.

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

Do not preserve:
- sentence structure
- sentence order
- information order
- paragraph architecture
- original opening
- original ending
- transition style
- explanation order

Paragraph role rule:
Keep the paragraph's job in the essay. It may introduce a topic, explain a cause, define a term, give an example, expand an argument, compare ideas, transition, or close a section. Preserve the job, not the structure used to do the job.

Continuity rule:
Use the previous and next paragraphs only for placement and flow. Do not borrow their facts, names, examples, or subject matter unless those already appear in the current paragraph.

Reconstruction rule:
If the revision keeps the same sentence order, information order, and paragraph movement, it failed. Rebuild the paragraph. Decide what matters most, what should come first, what can be combined, what sounds unnatural, and what structure communicates the idea better.

Openings:
Prefer a concrete observation, specific example, practical consequence, direct explanation, continuation from the previous idea, or named event/object when relevant. Avoid generic openings such as "X is one of," "To understand," "Throughout history," "Many scholars argue," "Since ancient times," "In modern society," and "It is important to note."

Endings:
Do not force broad significance endings. Avoid "This demonstrates," "This reveals," "This highlights," "This illustrates," "This ultimately shows," and "This remains important because." Some paragraphs should end with an observation, example, consequence, specific detail, or bridge to the next idea.

Style:
- Vary sentence rhythm naturally.
- Avoid unnecessary stacked lists.
- Reduce excessive certainty such as clearly, obviously, undoubtedly, proves, demonstrates, and reveals.
- Prefer concrete language when it fits the facts.
- Keep the revised paragraph within 95% to 130% of the original word count.
- Never use em dashes.
- Do not use validation, preservation, anchor, or process language inside revisedText.

Forbidden inside revisedText:
- Examples such as...
- remain part of the discussion
- remains included
- preserved in the revision
- anchors
- subject matter preserved
- this paragraph still discusses
- the revision preserves
- key examples remain
- included naturally

Before returning, check that revisedText has the same subject, preserves major facts/examples/named entities, fits after the previous paragraph, leads toward the next paragraph, reconstructs rather than paraphrases, avoids neighboring topic bleed, contains no process language, and contains no em dashes.

whatChanged should be short and factual. Do not overclaim.

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
