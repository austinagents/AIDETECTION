import { demoAnalysis, riskLabelFor } from "@/lib/constants";
import { AppError, safeDetails } from "@/lib/api/errors";
import { aiRiskToAuthenticityScore, inferScoreScale, normalizeScore, normalizeScoreGroup, riskLabelFromAuthenticityScore } from "@/lib/scoring/normalizeScore";
import { AnalysisResult, ContentType, ParagraphAnalysis, StyleProfile } from "@/lib/types";
import { getOpenAIClient } from "./client";
import { extractJson } from "./json";
import { OPENAI_MODEL } from "./model";

type AnalyzeInput = {
  title: string;
  content: string;
  contentType: ContentType;
  styleProfile?: StyleProfile | null;
};

export async function analyzeWriting(input: AnalyzeInput): Promise<AnalysisResult> {
  const client = getOpenAIClient();
  if (!client) return heuristicAnalysis(input.content, input.styleProfile);

  try {
    const response = await client.chat.completions.create({
      model: OPENAI_MODEL,
      response_format: { type: "json_object" },
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You are an authorship evidence analyst. Evaluate two competing hypotheses: a human wrote this, or AI wrote this. Do not grade writing quality, grammar, readability, or probability. Weigh Human Authorship Evidence against AI Authorship Evidence. Do not claim certainty. Do not make evasion-related claims. Return strict JSON only."
        },
        {
          role: "user",
          content: `Analyze this draft as an authorship evidence engine.

Core question:
What evidence suggests a human wrote this?
What evidence suggests AI wrote this?

Human Authorship Evidence increases authenticity:
- Authorial judgment: prioritization, interpretation, emphasis, comparison, contrast, causality, significance, intentional weighting.
- Specificity: concrete nouns, grounded examples, precise verbs, situational context, tangible details, named concepts.
- Sentence variation: varied sentence length, varied openings, rhythm changes, emphasis, occasional short sentences, non-symmetrical flow.
- Information hierarchy: clear primary idea, supporting ideas, contrast, emphasis, hierarchy.
- Information compression: compact insight, high information density, efficient expression, compressed meaning.
- Surprise / contrast: unexpected interpretation, original framing, perspective shifts, contrast.
- Natural flow: natural transitions, conversational logic, authentic rhythm.

AI Authorship Evidence lowers authenticity:
- Generic framing: low-information openings, broad introductory claims, generic educational framing, filler context.
- Professionalized AI Writing Fingerprint: writing sounds like a professionally edited report, consultant summary, academic abstract, textbook explanation, corporate memo, or institutional analysis when the topic, audience, or context does not require that tone.
- Over-balancing: perfectly balanced clauses, excessive three-part lists, symmetrical sentence structure, evenly weighted information.
- Abstract language: abstract noun stacking, concept-heavy writing without grounding, generalized claims.
- Predictable structure: repeated claim / explanation / expansion / conclusion structure.
- Flat summary tone: encyclopedia voice, informational summary tone, educational overview style, evenly weighted facts.
- Low specificity: broad claims, generic examples, vague references, placeholder nouns.
- Template-like transitions: obvious progression, predictable flow, mechanical transitions, essay-template structure.

Professionalized AI Writing Fingerprint is especially important for essays, short answers, general writing, student writing, casual explanatory writing, consumer-facing writing, and simple topic explanations. Do not penalize strong, educated, or formal writing when the context requires it. Penalize mismatch: polished, institutional, study-like, consultant-like, or textbook-like prose that sounds more professionalized than the context calls for.

Evaluate repeated or combined AI-associated fingerprints, not brittle keyword-only matches:
- Dash dependency: repeated em dashes, dash-like explanatory rhythm, and overused hyphenated compound constructions.
- Contrast template overuse: formulaic "not X, but Y" or "not about X, it is about Y" structures.
- Professional study tone: institutional explanatory moves that sound like a whitepaper, study, or academic overview.
- Artificial insight framing: generic depth markers that create the appearance of insight without adding much meaning.
- Overly balanced explanations: frequent neat three-part lists and evenly distributed ideas.
- Institutional noun stacking: high density of abstract nouns without concrete grounding.
- Consultant / corporate verbs: strategy-document verbs when the context does not call for them.
- Generic expert voice: everything sounds correct, smooth, certain, and generic, with no local detail or real choice.
- Textbook summary cadence: broad topic statement, explanatory expansion, social implication, concluding significance statement.
- Idealized human writing: text that is too neat, too vivid, too clean, or too explanatory.

Document-level evidence:
Evaluate theme consistency, recurring priorities, recurring viewpoints, voice consistency, reasoning consistency, argument development, and information progression. Ask whether the document feels like one person making a series of choices, or like independently generated paragraphs.

Personal Voice is not Human Authorship Evidence. It is identity/profile evidence. Objective human writing can have little or no personal voice. Do not penalize academic, technical, legal, journalistic, historical, or business writing for being impersonal.

If no writing profile is provided, personalVoice and voiceOwnership must not affect authenticityScore, riskLabel, paragraph risk, or revision scoring. Return them as 0 or neutral informational values only.

If a writing profile is provided, personalVoice and voiceOwnership may represent profile alignment / voice match. These remain profile metrics, not detector metrics. Include revision suggestions that move the draft closer to that profile without changing the user's meaning.

Return all scores as integers from 0 to 100. Do not return decimals.
The top-level "authenticityScore" is positive: higher means stronger Human Authorship Evidence and weaker AI Authorship Evidence.
For paragraph "risk", higher means that paragraph has more AI-like risk signals.
Risk is derived from authenticityScore: 76-100 low, 51-75 medium, 0-50 high.

Return exactly this JSON shape:
{
  "authenticityScore": number,
  "confidence": "low" | "medium" | "high",
  "riskLabel": "low" | "medium" | "high",
  "summary": string,
  "scores": {
    "authorialJudgment": number,
    "predictability": number,
    "structuralUniformity": number,
    "genericPhrasing": number,
    "professionalizedWritingBias": number,
    "specificity": number,
    "informationHierarchy": number,
    "personalVoice": number,
    "voiceOwnership": number,
    "informationCompression": number,
    "surpriseContrast": number,
    "naturalFlow": number,
    "emotionalTexture": number,
    "vocabularyNaturalness": number,
    "sentenceRhythmVariance": number
  },
  "mainReasons": string[],
  "humanAuthorshipEvidence": string[],
  "aiAuthorshipEvidence": string[],
  "documentEvidence": string[],
  "paragraphs": [
    {
      "index": number,
      "text": string,
      "risk": number,
      "riskLabel": "low" | "medium" | "high",
      "reasons": string[],
      "suggestions": string[],
      "humanEvidence": string[],
      "aiEvidence": string[]
    }
  ],
  "revisionStrategy": string[],
  "styleAlignedSuggestions": string[]
}

Title: ${input.title}
Content type: ${input.contentType}
Writing profile: ${input.styleProfile ? JSON.stringify(input.styleProfile) : "No profile available"}
Draft:
${input.content}`
        }
      ]
    });

    try {
      const parsed = extractJson<AnalysisResult>(response.choices[0]?.message?.content ?? "{}");
      return normalizeAnalysis(parsed, input.content);
    } catch (error) {
      const fallback = heuristicAnalysis(input.content, input.styleProfile);
      return {
        ...fallback,
        confidence: "low",
        summary:
          "The OpenAI response could not be parsed as structured JSON, so this result uses local preview scoring. Try again for a full model-backed analysis."
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new AppError(
      "OPENAI_ERROR",
      "OpenAI analysis failed. Check that OPENAI_API_KEY is valid and the configured model is available.",
      502,
      safeDetails(message)
    );
  }
}

function normalizeAnalysis(result: AnalysisResult, content: string): AnalysisResult {
  const paragraphs = splitParagraphs(content);
  const rawResult = result as AnalysisResult & {
    authenticityScore?: unknown;
    overallAuthenticity?: unknown;
    authenticity?: unknown;
    aiLikenessRisk?: unknown;
    aiRisk?: unknown;
  };
  const scoreValues = [
    rawResult.authenticityScore,
    rawResult.overallAuthenticity,
    rawResult.authenticity,
    rawResult.overallRisk,
    rawResult.aiLikenessRisk,
    rawResult.aiRisk,
    result.scores?.predictability,
    result.scores?.structuralUniformity,
    result.scores?.genericPhrasing,
    result.scores?.professionalizedWritingBias,
    result.scores?.authorialJudgment,
    result.scores?.specificity,
    result.scores?.informationHierarchy,
    result.scores?.personalVoice,
    result.scores?.voiceOwnership,
    result.scores?.informationCompression,
    result.scores?.surpriseContrast,
    result.scores?.naturalFlow,
    result.scores?.emotionalTexture,
    result.scores?.vocabularyNaturalness,
    result.scores?.sentenceRhythmVariance,
    ...(Array.isArray(result.paragraphs) ? result.paragraphs.map((paragraph) => paragraph.risk) : [])
  ];
  const scoreScale = inferScoreScale(scoreValues);
  const authenticitySource = rawResult.authenticityScore ?? rawResult.overallAuthenticity ?? rawResult.authenticity;
  const overallRiskSource = rawResult.aiLikenessRisk ?? rawResult.aiRisk ?? rawResult.overallRisk;
  const authenticityScore =
    authenticitySource !== undefined && authenticitySource !== null
      ? normalizeScore(authenticitySource, { scale: scoreScale })
      : aiRiskToAuthenticityScore(overallRiskSource, scoreScale);

  const normalizedScores = normalizeScoreGroup([
    result.scores?.authorialJudgment,
    result.scores?.predictability,
    result.scores?.structuralUniformity,
    result.scores?.genericPhrasing,
    result.scores?.professionalizedWritingBias,
    result.scores?.specificity,
    result.scores?.informationHierarchy,
    result.scores?.personalVoice,
    result.scores?.voiceOwnership,
    result.scores?.informationCompression,
    result.scores?.surpriseContrast,
    result.scores?.naturalFlow,
    result.scores?.emotionalTexture,
    result.scores?.vocabularyNaturalness,
    result.scores?.sentenceRhythmVariance
  ]);

  return {
    ...result,
    overallRisk: authenticityScore,
    riskLabel: riskLabelFromAuthenticityScore(authenticityScore),
    confidence: result.confidence ?? "medium",
    scores: {
      authorialJudgment: normalizedScores[0],
      predictability: normalizedScores[1],
      structuralUniformity: normalizedScores[2],
      genericPhrasing: normalizedScores[3],
      professionalizedWritingBias: normalizedScores[4],
      specificity: normalizedScores[5],
      informationHierarchy: normalizedScores[6],
      personalVoice: normalizedScores[7],
      voiceOwnership: normalizedScores[8],
      informationCompression: normalizedScores[9],
      surpriseContrast: normalizedScores[10],
      naturalFlow: normalizedScores[11],
      emotionalTexture: normalizedScores[12],
      vocabularyNaturalness: normalizedScores[13],
      sentenceRhythmVariance: normalizedScores[14]
    },
    mainReasons: Array.isArray(result.mainReasons) ? result.mainReasons.slice(0, 6) : demoAnalysis.mainReasons,
    humanAuthorshipEvidence: Array.isArray(result.humanAuthorshipEvidence) ? result.humanAuthorshipEvidence.slice(0, 8) : demoAnalysis.humanAuthorshipEvidence,
    aiAuthorshipEvidence: Array.isArray(result.aiAuthorshipEvidence) ? result.aiAuthorshipEvidence.slice(0, 8) : demoAnalysis.aiAuthorshipEvidence,
    documentEvidence: Array.isArray(result.documentEvidence) ? result.documentEvidence.slice(0, 6) : demoAnalysis.documentEvidence,
    paragraphs: ((Array.isArray(result.paragraphs) && result.paragraphs.length ? result.paragraphs : paragraphs.map((text, index) => ({
      index,
      text,
      risk: 100 - authenticityScore,
      riskLabel: riskLabelFor(100 - authenticityScore),
      reasons: ["This paragraph needs stronger Human Authorship Evidence before it can be scored confidently."],
      suggestions: ["Add authorial judgment, concrete details, and more varied sentence rhythm."]
    }))) as ParagraphAnalysis[]).map((paragraph, index) => {
      const risk = normalizeScore(paragraph.risk, { scale: scoreScale });
      return {
        ...paragraph,
        index: paragraph.index ?? index,
        risk,
        riskLabel: riskLabelFor(risk),
        humanEvidence: Array.isArray(paragraph.humanEvidence) ? paragraph.humanEvidence : [],
        aiEvidence: Array.isArray(paragraph.aiEvidence) ? paragraph.aiEvidence : []
      };
    }),
    revisionStrategy: Array.isArray(result.revisionStrategy) ? result.revisionStrategy : demoAnalysis.revisionStrategy,
    styleAlignedSuggestions: Array.isArray(result.styleAlignedSuggestions) ? result.styleAlignedSuggestions : demoAnalysis.styleAlignedSuggestions
  };
}

function splitParagraphs(content: string) {
  return content.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
}

function heuristicAnalysis(content: string, styleProfile?: StyleProfile | null): AnalysisResult {
  const paragraphs = splitParagraphs(content);
  const words = content.split(/\s+/).filter(Boolean);
  const genericTerms = ["moreover", "furthermore", "in conclusion", "it is important", "overall", "significant", "various"];
  const genericHits = genericTerms.filter((term) => content.toLowerCase().includes(term)).length;
  const avgSentenceLength = words.length / Math.max(1, content.split(/[.!?]+/).filter((item) => item.trim()).length);
  const specificity = Math.max(18, Math.min(82, 78 - genericHits * 9 - (avgSentenceLength > 24 ? 12 : 0)));
  const predictability = Math.min(88, 42 + genericHits * 12 + (avgSentenceLength > 22 ? 14 : 0));
  const structuralUniformity = paragraphs.length > 2 ? 58 : 42;
  const genericPhrasing = Math.min(86, 38 + genericHits * 14);
  const dashSignals = (content.match(/[—–-]/g) ?? []).length;
  const abstractTerms = ["meaning", "identity", "culture", "society", "humanity", "morality", "civilization", "tradition", "values", "beliefs", "framework", "significance", "relationship", "understanding"];
  const abstractHits = abstractTerms.filter((term) => content.toLowerCase().includes(term)).length;
  const professionalizedWritingBias = Math.min(92, 28 + genericHits * 10 + abstractHits * 4 + dashSignals * 6 + (avgSentenceLength > 24 ? 12 : 0));
  const personalVoice = styleProfile && styleProfile.styleRules.length ? 55 : 0;
  const rhythm = avgSentenceLength > 24 ? 39 : 58;
  const authorialJudgment = Math.max(28, Math.min(78, specificity - genericHits * 4 + (content.includes("because") ? 8 : 0)));
  const informationHierarchy = Math.max(25, Math.min(78, 64 - structuralUniformity / 3 - genericHits * 4));
  const voiceOwnership = personalVoice;
  const informationCompression = Math.max(22, Math.min(82, 68 - (avgSentenceLength > 24 ? 18 : 0) - genericHits * 6));
  const surpriseContrast = Math.max(18, Math.min(76, content.match(/\b(but|however|instead|rather|although|while)\b/i) ? specificity + 8 : specificity - 12));
  const naturalFlow = Math.max(26, Math.min(80, rhythm + (genericHits ? -8 : 6)));
  const aiRisk = Math.round(
    (predictability +
      structuralUniformity +
      genericPhrasing +
      professionalizedWritingBias +
      (100 - specificity) +
      (100 - authorialJudgment) +
      (100 - informationHierarchy) +
      (100 - informationCompression) +
      (100 - surpriseContrast) +
      (100 - naturalFlow)) /
      10
  );
  const authenticityScore = 100 - aiRisk;

  return {
    ...demoAnalysis,
    overallRisk: authenticityScore,
    confidence: words.length < 120 ? "low" : "medium",
    riskLabel: riskLabelFromAuthenticityScore(authenticityScore),
    summary:
      "Local preview scoring found patterns that may read as AI-like. Add an OpenAI API key for deeper paragraph-level analysis and richer style-aligned suggestions.",
    scores: {
      authorialJudgment,
      predictability,
      structuralUniformity,
      genericPhrasing,
      professionalizedWritingBias,
      specificity,
      informationHierarchy,
      personalVoice,
      voiceOwnership,
      informationCompression,
      surpriseContrast,
      naturalFlow,
      emotionalTexture: Math.max(25, specificity - 4),
      vocabularyNaturalness: 56,
      sentenceRhythmVariance: rhythm
    },
    humanAuthorshipEvidence: [
      "Some sentences attempt to explain significance.",
      "The draft has a consistent topic focus."
    ],
    aiAuthorshipEvidence: [
      "Several claims use broad framing rather than authorial judgment.",
      "The structure may distribute ideas too evenly.",
      "The tone may sound more professionally polished than the context requires."
    ],
    documentEvidence: [
      "The document would read as more authored if its ideas were prioritized and developed through clearer contrasts."
    ],
    paragraphs: paragraphs.map((text, index) => {
      const paragraphRisk = Math.max(20, Math.min(88, aiRisk + (text.length > 650 ? 8 : 0) + (genericTerms.some((term) => text.toLowerCase().includes(term)) ? 10 : -4)));
      return {
        index,
        text,
        risk: paragraphRisk,
        riskLabel: riskLabelFor(paragraphRisk),
        reasons: [
          "The paragraph needs stronger authorial judgment and more concrete grounding.",
          "Sentence rhythm and information hierarchy should be checked for natural variation."
        ],
        suggestions: [
          "Add a specific example, constraint, or interpretation of what matters.",
          "Compress one broad idea into a sharper, more owned sentence."
        ],
        humanEvidence: ["Consistent topic focus"],
        aiEvidence: ["Broad framing", "Low specificity", "Professionalized tone"]
      };
    }),
    styleAlignedSuggestions: styleProfile?.styleRules?.length
      ? styleProfile.styleRules.slice(0, 4)
      : ["Save writing samples to make suggestions reflect your own style."]
  };
}
