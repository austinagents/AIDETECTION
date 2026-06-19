import { demoAnalysis, riskLabelFor } from "@/lib/constants";
import { AnalysisResult, ContentType, StyleProfile } from "@/lib/types";
import { getOpenAIClient } from "./client";
import { clampScore, extractJson } from "./json";

type AnalyzeInput = {
  title: string;
  content: string;
  contentType: ContentType;
  styleProfile?: StyleProfile | null;
};

export async function analyzeWriting(input: AnalyzeInput): Promise<AnalysisResult> {
  const client = getOpenAIClient();
  if (!client) return heuristicAnalysis(input.content, input.styleProfile);

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          "You are an AI-authenticity writing analyst. Analyze AI-like writing signals with structured scoring. Do not claim certainty about authorship. Do not mention bypassing detectors, evading systems, or making text undetectable. Return strict JSON only."
      },
      {
        role: "user",
        content: `Analyze this draft for AI-like writing risk signals.

Judge signals such as overly balanced tone, generic transitions, predictable sentence structure, low specificity, lack of personal voice, polished but empty wording, uniform paragraph structure, generic conclusions, low emotional texture, and absence of concrete details.

If a writing profile is provided, include revision suggestions that move the draft closer to that profile without changing the user's meaning.

Return exactly this JSON shape:
{
  "overallRisk": number,
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

  const parsed = extractJson<AnalysisResult>(response.choices[0]?.message?.content ?? "{}");
  return normalizeAnalysis(parsed, input.content);
}

function normalizeAnalysis(result: AnalysisResult, content: string): AnalysisResult {
  const paragraphs = splitParagraphs(content);
  const overallRisk = clampScore(result.overallRisk);
  return {
    ...result,
    overallRisk,
    riskLabel: result.riskLabel ?? riskLabelFor(overallRisk),
    confidence: result.confidence ?? "medium",
    scores: {
      predictability: clampScore(result.scores?.predictability),
      structuralUniformity: clampScore(result.scores?.structuralUniformity),
      genericPhrasing: clampScore(result.scores?.genericPhrasing),
      specificity: clampScore(result.scores?.specificity),
      personalVoice: clampScore(result.scores?.personalVoice),
      emotionalTexture: clampScore(result.scores?.emotionalTexture),
      vocabularyNaturalness: clampScore(result.scores?.vocabularyNaturalness),
      sentenceRhythmVariance: clampScore(result.scores?.sentenceRhythmVariance)
    },
    mainReasons: Array.isArray(result.mainReasons) ? result.mainReasons.slice(0, 6) : demoAnalysis.mainReasons,
    paragraphs: (Array.isArray(result.paragraphs) && result.paragraphs.length ? result.paragraphs : paragraphs.map((text, index) => ({
      index,
      text,
      risk: overallRisk,
      riskLabel: riskLabelFor(overallRisk),
      reasons: ["This paragraph needs more specific evidence before it can be scored confidently."],
      suggestions: ["Add concrete details and vary the sentence rhythm."]
    }))).map((paragraph, index) => {
      const risk = clampScore(paragraph.risk);
      return { ...paragraph, index: paragraph.index ?? index, risk, riskLabel: paragraph.riskLabel ?? riskLabelFor(risk) };
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
  const overallRisk = Math.round((predictability + structuralUniformity + genericPhrasing + (100 - specificity) + (100 - personalVoice) + (100 - rhythm)) / 6);

  return {
    ...demoAnalysis,
    overallRisk,
    confidence: words.length < 120 ? "low" : "medium",
    riskLabel: riskLabelFor(overallRisk),
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
      const paragraphRisk = Math.max(20, Math.min(88, overallRisk + (text.length > 650 ? 8 : 0) + (genericTerms.some((term) => text.toLowerCase().includes(term)) ? 10 : -4)));
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
