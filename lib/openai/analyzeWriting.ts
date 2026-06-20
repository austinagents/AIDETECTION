import { demoAnalysis, riskLabelFor } from "@/lib/constants";
import { AppError, safeDetails } from "@/lib/api/errors";
import { calibrateAuthenticityScore } from "@/lib/scoring/calibrateAuthenticity";
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
            "You are an authorship evidence analyst. Evaluate whether text looks naturally human-written in its context or whether it contains visible AI-writing fingerprints. Do not grade writing quality, grammar, readability, creativity, originality, insightfulness, polish, or academic sophistication. Do not claim certainty. Do not make evasion-related claims. Return strict JSON only."
        },
        {
          role: "user",
          content: `Analyze this draft as an authorship evidence engine.

Core question:
How likely is it that a normal person would naturally produce this exact writing in this context?

Do not ask whether the writing is excellent. Average, plain, boring, direct, uneven, simple, or repetitive writing can be highly authentic if it looks naturally human-authored and lacks major AI-writing fingerprints.

Human Authorship Evidence increases authenticity:
- Human decision-making: basic choices about what information matters, what order ideas belong in, what gets emphasized, and what gets left alone. Do not require advanced insight, originality, creativity, distinctive perspective, or polished academic judgment.
- Specificity: concrete nouns, grounded examples, precise verbs, situational context, tangible details, named concepts.
- Sentence variation: normal human rhythm, imperfect variation, varied openings, and non-mechanical flow.
- Information hierarchy: clear primary idea and supporting details. Do not require originality.
- Information compression: avoiding unnecessary expansion and repeated explanation. Do not require clever compression or poetic concision.
- Natural flow: natural transitions, conversational logic, authentic rhythm.
- Context-appropriate plainness: direct, normal phrasing that fits the assignment or audience.

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

High authenticity means the text looks naturally human-written. It does not need to be impressive, creative, surprising, personal, highly original, or beautifully written. A plain sentence can score very high if it sounds like a normal person would write it. A polished institutional sentence can score low if it looks like AI-generated professional prose.

Score calibration:
- 95-100: Very likely natural human writing for the context. It may be plain, average, direct, or imperfect.
- 85-94: Mostly natural human writing with only minor AI-associated fingerprints.
- 76-84: Generally human-like, but some visible AI-associated patterns remain.
- 51-75: Mixed evidence with noticeable AI-writing fingerprints.
- 0-50: Strong AI-associated writing behavior.

Do not hold a score below 85 because the writing lacks surprise, originality, personal voice, advanced interpretation, or impressive style. If major AI fingerprints are absent, the score should be high even when the writing is simple.

Document-level evidence:
Evaluate theme consistency, recurring priorities, reasoning consistency, argument development, and information progression. Ask whether the document feels like one person naturally working through a topic, or like independently generated paragraphs. Do not reward polish for its own sake.

Personal Voice is not Human Authorship Evidence. It is identity/profile evidence. Objective human writing can have little or no personal voice. Do not penalize academic, technical, legal, journalistic, historical, or business writing for being impersonal.

If no writing profile is provided, personalVoice and voiceOwnership must not affect authenticityScore, riskLabel, paragraph risk, or revision scoring. Return them as 0 or neutral informational values only.

If a writing profile is provided, personalVoice and voiceOwnership may represent profile alignment / voice match. These remain profile metrics, not detector metrics. Include revision suggestions that move the draft closer to that profile without changing the user's meaning.

Return all scores as integers from 0 to 100. Do not return decimals.
The top-level "authenticityScore" is positive: higher means stronger natural-human likelihood and weaker AI-writing fingerprints.
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
  const rawAuthenticityScore =
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

  const scores = {
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
  };
  const authenticityScore = calibrateAuthenticityScore(rawAuthenticityScore, scores);

  return {
    ...result,
    overallRisk: authenticityScore,
    riskLabel: riskLabelFromAuthenticityScore(authenticityScore),
    confidence: result.confidence ?? "medium",
    scores,
    mainReasons: Array.isArray(result.mainReasons) ? result.mainReasons.slice(0, 6) : demoAnalysis.mainReasons,
    humanAuthorshipEvidence: Array.isArray(result.humanAuthorshipEvidence) ? result.humanAuthorshipEvidence.slice(0, 8) : demoAnalysis.humanAuthorshipEvidence,
    aiAuthorshipEvidence: Array.isArray(result.aiAuthorshipEvidence) ? result.aiAuthorshipEvidence.slice(0, 8) : demoAnalysis.aiAuthorshipEvidence,
    documentEvidence: Array.isArray(result.documentEvidence) ? result.documentEvidence.slice(0, 6) : demoAnalysis.documentEvidence,
    paragraphs: ((Array.isArray(result.paragraphs) && result.paragraphs.length ? result.paragraphs : paragraphs.map((text, index) => ({
      index,
      text,
      risk: 100 - authenticityScore,
      riskLabel: riskLabelFor(100 - authenticityScore),
      reasons: ["This paragraph may need review before it can be scored confidently."],
      suggestions: ["Use plainer context-appropriate phrasing and concrete grounding where the wording feels broad."]
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
  const lowerContent = content.toLowerCase();
  const genericTerms = ["moreover", "furthermore", "in conclusion", "it is important", "overall", "significant", "various"];
  const professionalTerms = ["framework", "significance", "underscores", "demonstrates", "highlights", "provides insight", "serves as", "broader pattern", "foundational", "constructed", "transmitted", "facilitate", "optimize", "leverage"];
  const genericHits = genericTerms.filter((term) => lowerContent.includes(term)).length;
  const professionalHits = professionalTerms.filter((term) => lowerContent.includes(term)).length;
  const sentenceCount = Math.max(1, content.split(/[.!?]+/).filter((item) => item.trim()).length);
  const avgSentenceLength = words.length / sentenceCount;
  const specificity = clampScore(78 - genericHits * 7 - professionalHits * 2 - (avgSentenceLength > 30 ? 8 : 0));
  const predictability = clampScore(26 + genericHits * 10 + professionalHits * 4 + (avgSentenceLength > 26 ? 10 : 0));
  const structuralUniformity = clampScore(28 + (paragraphs.length > 2 ? 12 : 0) + (avgSentenceLength > 28 ? 8 : 0));
  const genericPhrasing = clampScore(22 + genericHits * 13 + professionalHits * 3);
  const dashSignals = (content.match(/[—–]/g) ?? []).length + Math.max(0, (content.match(/\b\w+-\w+\b/g) ?? []).length - 1);
  const abstractTerms = ["meaning", "identity", "culture", "society", "humanity", "morality", "civilization", "tradition", "values", "beliefs", "framework", "significance", "relationship", "understanding"];
  const abstractHits = abstractTerms.filter((term) => lowerContent.includes(term)).length;
  const balancedListSignals = (content.match(/\b[^,.!?;]+,\s+[^,.!?;]+,\s+(?:and|or)\s+[^,.!?;]+/gi) ?? []).length;
  const contrastTemplateSignals = (content.match(/\bnot\b[^.!?]{0,80}\bbut\b|\bnot\b[^.!?]{0,80}\bit (?:is|was)\b/gi) ?? []).length;
  const professionalizedWritingBias = clampScore(18 + genericHits * 8 + professionalHits * 8 + abstractHits * 3 + dashSignals * 7 + balancedListSignals * 6 + contrastTemplateSignals * 8 + (avgSentenceLength > 28 ? 8 : 0));
  const personalVoice = styleProfile && styleProfile.styleRules.length ? 55 : 0;
  const rhythm = clampScore(76 - Math.abs(avgSentenceLength - 17) * 1.6 - genericHits * 4 - professionalHits * 2);
  const authorialJudgment = clampScore(70 - genericHits * 5 - professionalHits * 2 + (/\b(because|so|but|instead|when|after)\b/i.test(content) ? 6 : 0));
  const informationHierarchy = clampScore(72 - structuralUniformity * 0.25 - genericHits * 4 - balancedListSignals * 5);
  const voiceOwnership = personalVoice;
  const informationCompression = clampScore(76 - (avgSentenceLength > 26 ? 10 : 0) - genericHits * 5 - professionalHits * 3 - abstractHits * 1.5);
  const surpriseContrast = clampScore(70 - genericHits * 3 - contrastTemplateSignals * 8);
  const naturalFlow = clampScore(rhythm + (genericHits ? -5 : 8) - professionalHits * 2);
  const sentenceRhythmVariance = rhythm;
  const scores = {
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
    vocabularyNaturalness: 68,
    sentenceRhythmVariance
  };
  const fingerprintPenalty =
    professionalizedWritingBias * 0.32 +
    genericPhrasing * 0.24 +
    predictability * 0.16 +
    structuralUniformity * 0.1 +
    Math.max(0, 58 - specificity) * 0.12 +
    Math.max(0, 58 - naturalFlow) * 0.06;
  const authenticityScore = calibrateAuthenticityScore(clampScore(100 - fingerprintPenalty), scores);

  return {
    ...demoAnalysis,
    overallRisk: authenticityScore,
    confidence: words.length < 120 ? "low" : "medium",
    riskLabel: riskLabelFromAuthenticityScore(authenticityScore),
    summary:
      "Local preview scoring found patterns that may read as AI-like. Add an OpenAI API key for deeper paragraph-level analysis and richer style-aligned suggestions.",
    scores,
    humanAuthorshipEvidence: [
      "The draft has some ordinary authorial choices.",
      "The draft has a consistent topic focus."
    ],
    aiAuthorshipEvidence: localAiEvidence({
      genericPhrasing,
      professionalizedWritingBias,
      predictability,
      structuralUniformity,
      specificity,
      naturalFlow
    }),
    documentEvidence: [
      "The document would read as more naturally human if its ideas were prioritized with less professionalized framing."
    ],
    paragraphs: paragraphs.map((text, index) => {
      const paragraphRisk = clampScore(100 - authenticityScore + (text.length > 650 ? 8 : 0) + (genericTerms.some((term) => text.toLowerCase().includes(term)) ? 10 : -6));
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
          "Use plainer, more context-appropriate phrasing.",
          "Add concrete grounding where the paragraph feels broad."
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

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function localAiEvidence(scores: Pick<AnalysisResult["scores"], "genericPhrasing" | "professionalizedWritingBias" | "predictability" | "structuralUniformity" | "specificity" | "naturalFlow">) {
  const evidence = [
    scores.genericPhrasing >= 50 ? "The writing uses broad generic framing." : null,
    scores.professionalizedWritingBias >= 50 ? "The tone may sound more professionally polished than the context requires." : null,
    scores.predictability >= 58 ? "The structure may feel predictable or template-like." : null,
    scores.structuralUniformity >= 65 ? "The writing distributes ideas too evenly." : null,
    scores.specificity <= 45 ? "The wording could use more concrete grounding." : null,
    scores.naturalFlow <= 45 ? "The flow may feel mechanical rather than natural." : null
  ].filter((item): item is string => Boolean(item));

  return evidence.length ? evidence : ["No major AI-writing fingerprint was detected by local preview scoring."];
}
