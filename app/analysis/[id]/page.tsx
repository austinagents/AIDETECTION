import { notFound } from "next/navigation";
import { Shell } from "@/components/Shell";
import { RiskBadge } from "@/components/RiskBadge";
import { ScoreBar } from "@/components/ScoreBar";
import { Card } from "@/components/ui";
import { LOCAL_USER_ID } from "@/lib/constants";
import { getStorage } from "@/lib/storage";
import { Feedback, ParagraphActions } from "./ResultActions";

const scoreLabels = {
  predictability: "Predictability",
  structuralUniformity: "Structural uniformity",
  genericPhrasing: "Generic phrasing",
  specificity: "Specificity",
  personalVoice: "Personal voice",
  emotionalTexture: "Emotional texture",
  vocabularyNaturalness: "Vocabulary naturalness",
  sentenceRhythmVariance: "Sentence rhythm variance"
};

export default async function AnalysisResultPage({ params }: { params: { id: string } }) {
  const analysis = await getStorage().getAnalysis(LOCAL_USER_ID, params.id);
  if (!analysis) notFound();

  const result = analysis.result;
  const topScores = [
    ["Predictability", result.scores.predictability],
    ["Voice", result.scores.personalVoice],
    ["Specificity", result.scores.specificity],
    ["Structure", result.scores.structuralUniformity]
  ] as const;

  return (
    <Shell>
      <div className="flex items-start justify-between gap-8">
        <div>
          <p className="text-sm text-slate-400">{analysis.contentType} · {new Date(analysis.createdAt).toLocaleDateString()}</p>
          <h1 className="mt-2 text-3xl font-semibold">{analysis.title}</h1>
        </div>
        <RiskBadge label={result.riskLabel} />
      </div>

      <section className="mt-8 grid gap-6 xl:grid-cols-[360px_1fr]">
        <Card className="p-7">
          <p className="text-sm text-slate-400">Authenticity Score</p>
          <div className="mt-4 flex items-end gap-4">
            <span className="text-7xl font-semibold leading-none">{result.overallRisk}</span>
            <span className="pb-2 text-sm capitalize text-slate-400">{result.confidence} confidence</span>
          </div>
          <p className="mt-6 text-sm leading-6 text-slate-300">{result.summary}</p>
        </Card>

        <div className="grid gap-4 md:grid-cols-4">
          {topScores.map(([label, value]) => (
            <Card key={label} className="p-5">
              <p className="text-sm text-slate-400">{label}</p>
              <p className="mt-4 text-4xl font-semibold">{value}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1fr_360px]">
        <Card className="p-6">
          <h2 className="text-lg font-semibold">Score breakdown</h2>
          <div className="mt-5 grid gap-5 md:grid-cols-2">
            {Object.entries(result.scores).map(([key, value]) => (
              <ScoreBar key={key} label={scoreLabels[key as keyof typeof scoreLabels]} value={value} />
            ))}
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-lg font-semibold">Why this was flagged</h2>
          <div className="mt-4 space-y-3">
            {result.mainReasons.map((reason) => (
              <p key={reason} className="rounded-md border border-ink-700 bg-ink-950 p-3 text-sm leading-6 text-slate-300">{reason}</p>
            ))}
          </div>
        </Card>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold">Paragraph analysis</h2>
        <div className="mt-4 space-y-4">
          {result.paragraphs.map((paragraph) => (
            <Card key={paragraph.index} className={paragraph.riskLabel === "high" ? "border-risk-high/40 p-6" : "p-6"}>
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-300">Paragraph {paragraph.index + 1}</p>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold">{paragraph.risk}</span>
                  <RiskBadge label={paragraph.riskLabel} />
                </div>
              </div>
              <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-200">{paragraph.text}</p>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-sm font-medium text-slate-300">Reasons</p>
                  <ul className="mt-2 space-y-2 text-sm leading-6 text-slate-400">
                    {paragraph.reasons.map((reason) => <li key={reason}>{reason}</li>)}
                  </ul>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-300">Suggestions</p>
                  <ul className="mt-2 space-y-2 text-sm leading-6 text-slate-400">
                    {paragraph.suggestions.map((suggestion) => <li key={suggestion}>{suggestion}</li>)}
                  </ul>
                </div>
              </div>
              <ParagraphActions analysisId={analysis.id} paragraph={paragraph} />
            </Card>
          ))}
        </div>
      </section>

      <section className="mt-8 grid gap-6 md:grid-cols-2">
        <Card className="p-6">
          <h2 className="text-lg font-semibold">Revision strategy</h2>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-400">
            {result.revisionStrategy.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </Card>
        <Card className="p-6">
          <h2 className="text-lg font-semibold">Style-aligned suggestions</h2>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-400">
            {result.styleAlignedSuggestions.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </Card>
      </section>

      <Feedback analysisId={analysis.id} />
    </Shell>
  );
}
