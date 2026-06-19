import { demoAnalysis, riskLabelFor } from "@/lib/constants";
import { AppError, safeDetails } from "@/lib/api/errors";
import { aiRiskToAuthenticityScore, inferScoreScale, normalizeScore, normalizeScoreGroup, riskLabelFromAuthenticityScore } from "@/lib/scoring/normalizeScore";
import { AnalysisResult, ContentType, StyleProfile } from "@/lib/types";
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
            "You are an AI-authenticity writing analyst. Analyze AI-like writing signals with structured scoring. Do not claim certainty about authorship. Do not make evasion-related claims. Return strict JSON only."
        },
        {
          role: "user",
          content: `Analyze this draft for AI-like writing risk signals and return an authenticity-focused score.

Judge signals such as overly balanced tone, generic transitions, predictable sentence structure, low specificity, lack of personal voice, polished but empty wording, uniform paragraph structure, generic conclusions, low emotional texture, and absence of concrete details.

If a writing profile is provided, include revision suggestions that move the draft closer to that profile without changing the user's meaning.

Return all scores as integers from 0 to 100. Do not return decimals.
The top-level "authenticityScore" is positive: higher means more authentic and less AI-like.
For paragraph "risk", higher means that paragraph has more AI-like risk signals.

Return exactly this JSON shape:
{
  "authenticityScore": number,
  "confidence": "low" | "medium" | "high",
  "riskLabel": "low" | "medium" | "high",
  "summary": string,
  "scores": {
    "predictability": number,
    "structuralUniformity": number,
    "genericPhrasing": number,
    "specificity": number,
    "personalVoice": number,
    "emotionalTexture": number,
    "vocabularyNaturalness": number,
    "sentenceRhythmVariance": number
  },
  "mainReasons": string[],
  "paragraphs": [
    {
      "index": number,
      "text": string,
      "risk": number,
      "riskLabel": "low" | "medium" | "high",
      "reasons": string[],
      "suggestions": string[]
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
    result.scores?.specificity,
    result.scores?.personalVoice,
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
    result.scores?.predictability,
    result.scores?.structuralUniformity,
    result.scores?.genericPhrasing,
    result.scores?.specificity,
    result.scores?.personalVoice,
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
      predictability: normalizedScores[0],
      structuralUniformity: normalizedScores[1],
      genericPhrasing: normalizedScores[2],
      specificity: normalizedScores[3],
      personalVoice: normalizedScores[4],
      emotionalTexture: normalizedScores[5],
      vocabularyNaturalness: normalizedScores[6],
      sentenceRhythmVariance: normalizedScores[7]
    },
    mainReasons: Array.isArray(result.mainReasons) ? result.mainReasons.slice(0, 6) : demoAnalysis.mainReasons,
    paragraphs: (Array.isArray(result.paragraphs) && result.paragraphs.length ? result.paragraphs : paragraphs.map((text, index) => ({
      index,
      text,
      risk: 100 - authenticityScore,
      riskLabel: riskLabelFor(100 - authenticityScore),
      reasons: ["This paragraph needs more specific evidence before it can be scored confidently."],
      suggestions: ["Add concrete details and vary the sentence rhythm."]
    }))).map((paragraph, index) => {
      const risk = normalizeScore(paragraph.risk, { scale: scoreScale });
      return { ...paragraph, index: paragraph.index ?? index, risk, riskLabel: riskLabelFor(risk) };
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
  const personalVoice = styleProfile && styleProfile.styleRules.length ? 55 : 38;
  const rhythm = avgSentenceLength > 24 ? 39 : 58;
  const aiRisk = Math.round((predictability + structuralUniformity + genericPhrasing + (100 - specificity) + (100 - personalVoice) + (100 - rhythm)) / 6);
  const authenticityScore = 100 - aiRisk;

  return {
    ...demoAnalysis,
    overallRisk: authenticityScore,
    confidence: words.length < 120 ? "low" : "medium",
    riskLabel: riskLabelFromAuthenticityScore(authenticityScore),
    summary:
      "Local preview scoring found patterns that may read as AI-like. Add an OpenAI API key for deeper paragraph-level analysis and richer style-aligned suggestions.",
    scores: {
      predictability,
      structuralUniformity,
      genericPhrasing,
      specificity,
      personalVoice,
      emotionalTexture: Math.max(25, specificity - 4),
      vocabularyNaturalness: 56,
      sentenceRhythmVariance: rhythm
    },
    paragraphs: paragraphs.map((text, index) => {
      const paragraphRisk = Math.max(20, Math.min(88, aiRisk + (text.length > 650 ? 8 : 0) + (genericTerms.some((term) => text.toLowerCase().includes(term)) ? 10 : -4)));
      return {
        index,
        text,
        risk: paragraphRisk,
        riskLabel: riskLabelFor(paragraphRisk),
        reasons: [
          "The paragraph may benefit from more concrete details and less generalized phrasing.",
          "Sentence rhythm and transitions should be checked for natural variation."
        ],
        suggestions: [
          "Add a specific example, constraint, or personal observation.",
          "Break one polished sentence into a shorter, more direct sentence if that matches your voice."
        ]
      };
    }),
    styleAlignedSuggestions: styleProfile?.styleRules?.length
      ? styleProfile.styleRules.slice(0, 4)
      : ["Save writing samples to make suggestions reflect your own style."]
  };
}
