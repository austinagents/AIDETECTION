import { demoAnalysis, riskLabelFor } from "@/lib/constants";
import { AppError, safeDetails } from "@/lib/api/errors";
import { calibrateDetectorRisk } from "@/lib/scoring/calibrateDetectorRisk";
import { inferScoreScale, normalizeScore, normalizeScoreGroup, riskLabelFromRiskScore } from "@/lib/scoring/normalizeScore";
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
            "You emulate commercial AI-detection behavior. Estimate how likely AI detectors are to flag the text from visible AI-writing fingerprints. Do not judge human authorship, writing quality, grammar, readability, creativity, originality, insightfulness, polish, coherence, organization, or academic strength. Do not claim certainty. Do not make evasion-related claims. Return strict JSON only."
        },
        {
          role: "user",
          content: `Analyze this draft as an AI-detector emulation engine.

Core question:
How likely are commercial AI detectors to flag this text?

Do not ask whether the writing is good, coherent, specific, organized, or insightful. Those qualities must not raise the score. A perfectly organized and specific essay can still be high AI Detection Risk.

AI detector fingerprints increase risk:
- Generic framing: low-information openings, broad introductory claims, generic educational framing, filler context.
- Professionalized AI Writing Fingerprint: writing sounds like a professionally edited report, consultant summary, academic abstract, textbook explanation, corporate memo, or institutional analysis when the topic, audience, or context does not require that tone.
- Over-balancing: perfectly balanced clauses, excessive three-part lists, symmetrical sentence structure, evenly weighted information.
- Abstract language: abstract noun stacking, concept-heavy writing without grounding, generalized claims.
- Predictable structure: repeated claim / explanation / expansion / conclusion structure.
- Flat summary tone: encyclopedia voice, informational summary tone, educational overview style, evenly weighted facts.
- Template-like transitions: obvious progression, predictable flow, mechanical transitions, essay-template structure.
- Textbook cadence: repeated broad claim, explanation, and significance pattern across paragraphs.
- Essay template structure: introduction, definition, historical context, examples, interpretation, conclusion. Perfect academic structure is neutral or slightly AI-leaning, not a reason to lower detector risk.
- Predictable expansion pattern: opening a topic, explaining why it matters, describing what it explains, and concluding with social or cultural significance.
- Excessive confidence: smooth factual explanation across a whole document without uncertainty, limits, or source-aware language.

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

Score calibration:
- 0-20: Very Low AI Detection Risk.
- 21-40: Low AI Detection Risk.
- 41-60: Moderate AI Detection Risk.
- 61-80: High AI Detection Risk.
- 81-100: Very High AI Detection Risk.

If major AI fingerprints are present repeatedly, keep AI Detection Risk materially elevated even when the essay is organized, specific, coherent, or well compressed.

Document-level evidence:
Evaluate repeated detector fingerprints across the document: recurring textbook cadence, balanced paragraph structure, generic transitions, institutional wording, and smooth certainty. Do not reward polish, coherence, organization, hierarchy, or specificity for their own sake.

Return all scores as integers from 0 to 100. Do not return decimals.
The top-level "aiDetectionRisk" is the primary score: higher means more likely to be flagged by another AI detector.
For paragraph "risk", higher means that paragraph has more detector risk signals.
Risk labels: 0-40 low, 41-69 medium, 70-100 high.

Return exactly this JSON shape:
{
  "aiDetectionRisk": number,
  "confidence": "low" | "medium" | "high",
  "riskLabel": "low" | "medium" | "high",
  "summary": string,
  "scores": {
    "textbookCadence": number,
    "genericPhrasing": number,
    "professionalizedWritingBias": number,
    "predictableStructure": number,
    "balancedConstruction": number,
    "abstractNounDensity": number,
    "institutionalLanguage": number,
    "overExplanation": number,
    "smoothCertainty": number,
    "repetitiveCadence": number,
    "genericExpertVoice": number,
    "lowStylisticEntropy": number
  },
  "mainReasons": string[],
  "detectorSignals": string[],
  "documentEvidence": string[],
  "paragraphs": [
    {
      "index": number,
      "text": string,
      "risk": number,
      "riskLabel": "low" | "medium" | "high",
      "reasons": string[],
      "suggestions": string[],
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
    aiDetectionRisk?: unknown;
    aiLikenessRisk?: unknown;
    aiRisk?: unknown;
  };
  const scoreValues = [
    rawResult.aiDetectionRisk,
    rawResult.overallRisk,
    rawResult.aiLikenessRisk,
    rawResult.aiRisk,
    ...detectorScoreValues(result.scores as unknown as Record<string, unknown> | undefined),
    ...(Array.isArray(result.paragraphs) ? result.paragraphs.map((paragraph) => paragraph.risk) : [])
  ];
  const scoreScale = inferScoreScale(scoreValues);
  const riskSource = rawResult.aiDetectionRisk ?? rawResult.aiLikenessRisk ?? rawResult.aiRisk;
  const rawDetectorRisk =
    riskSource !== undefined && riskSource !== null
      ? normalizeScore(riskSource, { scale: scoreScale })
      : normalizeScore(rawResult.overallRisk, { scale: scoreScale });

  const normalizedScores = normalizeScoreGroup(detectorScoreValues(result.scores as unknown as Record<string, unknown> | undefined));

  const scores = {
    textbookCadence: normalizedScores[0],
    genericPhrasing: normalizedScores[1],
    professionalizedWritingBias: normalizedScores[2],
    predictableStructure: normalizedScores[3],
    balancedConstruction: normalizedScores[4],
    abstractNounDensity: normalizedScores[5],
    institutionalLanguage: normalizedScores[6],
    overExplanation: normalizedScores[7],
    smoothCertainty: normalizedScores[8],
    repetitiveCadence: normalizedScores[9],
    genericExpertVoice: normalizedScores[10],
    lowStylisticEntropy: normalizedScores[11]
  };
  const detectorRisk = calibrateDetectorRisk(rawDetectorRisk, scores, content);

  return {
    ...result,
    overallRisk: detectorRisk,
    riskLabel: riskLabelFromRiskScore(detectorRisk),
    confidence: result.confidence ?? "medium",
    scores,
    mainReasons: Array.isArray(result.mainReasons) ? result.mainReasons.slice(0, 6) : demoAnalysis.mainReasons,
    detectorSignals: detectorSignalsFor(result).slice(0, 8),
    documentEvidence: Array.isArray(result.documentEvidence) ? result.documentEvidence.slice(0, 6) : demoAnalysis.documentEvidence,
    paragraphs: ((Array.isArray(result.paragraphs) && result.paragraphs.length ? result.paragraphs : paragraphs.map((text, index) => ({
      index,
      text,
      risk: detectorRisk,
      riskLabel: riskLabelFor(detectorRisk),
      reasons: ["This paragraph may need review before it can be scored confidently."],
      suggestions: ["Reduce detector risk signals such as generic framing, academic cadence, and polished summary structure."]
    }))) as ParagraphAnalysis[]).map((paragraph, index) => {
      const risk = calibrateDetectorRisk(normalizeScore(paragraph.risk, { scale: scoreScale }), scores, paragraph.text);
      return {
        ...paragraph,
        index: paragraph.index ?? index,
        risk,
        riskLabel: riskLabelFor(risk),
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
  const lowerContent = content.toLowerCase();
  const genericTerms = ["moreover", "furthermore", "in conclusion", "it is important", "overall", "significant", "various", "throughout history", "for thousands of years", "one of humanity", "the origins of"];
  const professionalTerms = ["framework", "significance", "underscores", "demonstrates", "highlights", "provides insight", "serves as", "broader pattern", "foundational", "constructed", "transmitted", "facilitate", "optimize", "leverage", "phenomena", "interpret", "shaped society", "cultural identity"];
  const genericHits = genericTerms.filter((term) => lowerContent.includes(term)).length;
  const professionalHits = professionalTerms.filter((term) => lowerContent.includes(term)).length;
  const sentenceCount = Math.max(1, content.split(/[.!?]+/).filter((item) => item.trim()).length);
  const avgSentenceLength = words.length / sentenceCount;
  const predictableStructure = clampScore(32 + genericHits * 10 + professionalHits * 5 + (avgSentenceLength > 26 ? 10 : 0));
  const balancedConstruction = clampScore(34 + (paragraphs.length > 2 ? 18 : 0) + (avgSentenceLength > 28 ? 8 : 0));
  const genericPhrasing = clampScore(28 + genericHits * 13 + professionalHits * 4);
  const dashSignals = (content.match(/[—–]/g) ?? []).length + Math.max(0, (content.match(/\b\w+-\w+\b/g) ?? []).length - 1);
  const abstractTerms = ["meaning", "identity", "existence", "consciousness", "humanity", "society", "morality", "guidance", "understanding", "cosmos", "culture", "civilization", "tradition", "values", "beliefs", "framework", "significance", "relationship", "phenomena", "interpretation"];
  const abstractHits = abstractTerms.filter((term) => lowerContent.includes(term)).length;
  const balancedListSignals = (content.match(/\b[^,.!?;]+,\s+[^,.!?;]+,\s+(?:and|or)\s+[^,.!?;]+/gi) ?? []).length;
  const contrastTemplateSignals = (content.match(/\bnot\b[^.!?]{0,80}\bbut\b|\bnot\b[^.!?]{0,80}\bit (?:is|was)\b/gi) ?? []).length;
  const significanceMarkers = ["this shows", "this demonstrates", "this highlights", "this illustrates", "this reflects", "this underscores", "this reveals", "this suggests", "served as", "provided a way", "helped people understand"];
  const significanceHits = significanceMarkers.filter((term) => lowerContent.includes(term)).length;
  const textbookCadence = paragraphs.filter((paragraph) => {
    const sentenceCount = paragraph.split(/[.!?]+/).filter((item) => item.trim()).length;
    const paragraphLower = paragraph.toLowerCase();
    return sentenceCount >= 3 && significanceMarkers.some((term) => paragraphLower.includes(term));
  }).length;
  const textbookCadenceScore = clampScore(textbookCadence * 24 + significanceHits * 7 + genericHits * 4);
  const abstractNounDensity = clampScore(abstractHits * 8);
  const institutionalLanguage = clampScore(professionalHits * 10 + abstractHits * 3);
  const overExplanation = clampScore(significanceHits * 12 + (avgSentenceLength > 26 ? 16 : 0) + paragraphs.length * 3);
  const smoothCertainty = clampScore((words.length >= 180 ? 30 : 12) + significanceHits * 8);
  const genericExpertVoice = clampScore(professionalHits * 8 + genericHits * 5 + significanceHits * 6);
  const rhythm = clampScore(76 - Math.abs(avgSentenceLength - 17) * 1.6 - genericHits * 4 - professionalHits * 2);
  const repetitiveCadence = clampScore(100 - rhythm + textbookCadence * 8);
  const lowStylisticEntropy = clampScore(100 - rhythm + balancedListSignals * 8 + contrastTemplateSignals * 5);
  const professionalizedWritingBias = clampScore(22 + genericHits * 10 + professionalHits * 9 + abstractHits * 4 + dashSignals * 7 + balancedListSignals * 7 + contrastTemplateSignals * 8 + significanceHits * 7 + textbookCadence * 12 + (avgSentenceLength > 28 ? 8 : 0));
  const scores = {
    textbookCadence: textbookCadenceScore,
    genericPhrasing,
    professionalizedWritingBias,
    predictableStructure,
    balancedConstruction,
    abstractNounDensity,
    institutionalLanguage,
    overExplanation,
    smoothCertainty,
    repetitiveCadence,
    genericExpertVoice,
    lowStylisticEntropy
  };
  const fingerprintRisk =
    professionalizedWritingBias * 0.4 +
    genericPhrasing * 0.24 +
    predictableStructure * 0.2 +
    balancedConstruction * 0.16 +
    textbookCadenceScore * 0.16 +
    abstractNounDensity * 0.08 +
    institutionalLanguage * 0.08;
  const detectorRisk = calibrateDetectorRisk(clampScore(fingerprintRisk), scores, content);

  return {
    ...demoAnalysis,
    overallRisk: detectorRisk,
    confidence: words.length < 120 ? "low" : "medium",
    riskLabel: riskLabelFromRiskScore(detectorRisk),
    summary:
      "Local preview scoring found patterns that may read as AI-like. Add an OpenAI API key for deeper paragraph-level analysis and richer style-aligned suggestions.",
    scores,
    detectorSignals: localDetectorSignals({
      genericPhrasing,
      professionalizedWritingBias,
      predictableStructure,
      balancedConstruction,
      textbookCadence: textbookCadenceScore,
      abstractNounDensity,
      institutionalLanguage,
      overExplanation,
      smoothCertainty
    }),
    documentEvidence: [
      "Detector signals include repeated academic cadence, professionalized phrasing, and generic explanatory structure."
    ],
    paragraphs: paragraphs.map((text, index) => {
      const paragraphRisk = clampScore(detectorRisk + (text.length > 650 ? 8 : 0) + (genericTerms.some((term) => text.toLowerCase().includes(term)) ? 10 : -6));
      return {
        index,
        text,
        risk: paragraphRisk,
        riskLabel: riskLabelFor(paragraphRisk),
        reasons: [
          "The paragraph may still contain AI-associated phrasing or structure.",
          "Check whether the wording sounds more polished or generalized than the context calls for."
        ],
        suggestions: [
          "Reduce academic cadence and generic transitions.",
          "Break up balanced summary structure while preserving meaning."
        ],
        aiEvidence: ["Broad framing", "Professionalized tone", "Predictable cadence"]
      };
    }),
    styleAlignedSuggestions: styleProfile?.styleRules?.length
      ? styleProfile.styleRules.slice(0, 4)
      : ["Save writing samples to make suggestions reflect your own style."]
  };
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function detectorScoreValues(scores: Record<string, unknown> | undefined) {
  return [
    scores?.textbookCadence,
    scores?.genericPhrasing,
    scores?.professionalizedWritingBias,
    scores?.predictableStructure ?? scores?.predictability,
    scores?.balancedConstruction ?? scores?.structuralUniformity,
    scores?.abstractNounDensity,
    scores?.institutionalLanguage,
    scores?.overExplanation,
    scores?.smoothCertainty,
    scores?.repetitiveCadence,
    scores?.genericExpertVoice,
    scores?.lowStylisticEntropy ?? (typeof scores?.sentenceRhythmVariance === "number" ? 100 - scores.sentenceRhythmVariance : undefined)
  ];
}

function detectorSignalsFor(result: AnalysisResult) {
  const raw = result as AnalysisResult & { detectorSignals?: unknown; aiAuthorshipEvidence?: unknown };
  if (Array.isArray(raw.detectorSignals)) return raw.detectorSignals.filter((item): item is string => typeof item === "string");
  if (Array.isArray(raw.aiAuthorshipEvidence)) return raw.aiAuthorshipEvidence.filter((item): item is string => typeof item === "string");
  return demoAnalysis.detectorSignals ?? [];
}

function localDetectorSignals(scores: Pick<AnalysisResult["scores"], "genericPhrasing" | "professionalizedWritingBias" | "predictableStructure" | "balancedConstruction" | "textbookCadence" | "abstractNounDensity" | "institutionalLanguage" | "overExplanation" | "smoothCertainty">) {
  const evidence = [
    scores.genericPhrasing >= 50 ? "The writing uses broad generic framing." : null,
    scores.professionalizedWritingBias >= 50 ? "The tone may sound more professionally polished than the context requires." : null,
    scores.predictableStructure >= 58 ? "The structure may feel predictable or template-like." : null,
    scores.balancedConstruction >= 65 ? "The writing distributes ideas too evenly." : null,
    scores.textbookCadence >= 55 ? "The writing uses textbook-style claim and explanation cadence." : null,
    scores.abstractNounDensity >= 55 ? "The writing relies on abstract noun clusters." : null,
    scores.institutionalLanguage >= 55 ? "The wording leans institutional or academic-summary-like." : null,
    scores.overExplanation >= 55 ? "The paragraph may over-explain its significance." : null,
    scores.smoothCertainty >= 55 ? "The prose presents smooth certainty across the explanation." : null
  ].filter((item): item is string => Boolean(item));

  return evidence.length ? evidence : ["No major AI-writing fingerprint was detected by local preview scoring."];
}
