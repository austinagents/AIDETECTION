import { notFound } from "next/navigation";
import { Shell } from "@/components/Shell";
import { RiskBadge } from "@/components/RiskBadge";
import { Card } from "@/components/ui";
import { LOCAL_USER_ID } from "@/lib/constants";
import { formatScore, normalizeScore } from "@/lib/scoring/normalizeScore";
import { getStorage } from "@/lib/storage";
import { Feedback, RecommendedImprovements } from "./ResultActions";

export default async function AnalysisResultPage({ params }: { params: { id: string } }) {
  const storage = getStorage();
  const [analysis, profile] = await Promise.all([
    storage.getAnalysis(LOCAL_USER_ID, params.id),
    storage.getStyleProfile(LOCAL_USER_ID)
  ]);
  if (!analysis) notFound();

  const result = analysis.result;
  const authenticityScore = normalizeScore(result.overallRisk);
  const detectionContributors = result.paragraphs.filter((paragraph) => paragraph.risk >= 40).length;
  const writingCharacteristics = [
    ["Authorial Judgment", result.scores.authorialJudgment],
    ["Specificity", result.scores.specificity],
    ["Sentence Variety", result.scores.sentenceRhythmVariance],
    ["Information Compression", result.scores.informationCompression],
    ...(profile?.sampleCount ? ([["Voice Match", result.scores.personalVoice]] as const) : [])
  ] as const;
  const topIssues = (result.aiAuthorshipEvidence?.length ? result.aiAuthorshipEvidence : result.mainReasons).slice(0, 3);
  const humanEvidence = result.humanAuthorshipEvidence?.slice(0, 3) ?? [];

  return (
    <Shell>
      <div className="flex items-start justify-between gap-8">
        <div>
          <p className="text-sm text-slate-400">{analysis.contentType} · {new Date(analysis.createdAt).toLocaleDateString()}</p>
          <h1 className="mt-2 text-3xl font-semibold">{analysis.title}</h1>
        </div>
        <RiskBadge label={result.riskLabel} />
      </div>

      <section className="mt-8 grid gap-6 xl:grid-cols-[1fr_360px]">
        <Card className="p-7">
          <p className="text-sm text-slate-400">Authenticity Score</p>
          <div className="mt-4 flex items-end gap-4">
            <span className="text-7xl font-semibold leading-none">{formatScore(authenticityScore)}</span>
            <span className="pb-2 text-sm capitalize text-slate-400">{result.riskLabel} Risk</span>
          </div>
          <p className="mt-6 text-sm leading-6 text-slate-300">{result.summary}</p>
        </Card>

        <Card className="p-7">
          <p className="text-sm text-slate-400">Detection Risk</p>
          <p className="mt-4 text-4xl font-semibold capitalize">{result.riskLabel}</p>
          <p className="mt-5 text-sm leading-6 text-slate-400">
            {detectionContributors === 1
              ? "1 section contributed to this assessment."
              : `${detectionContributors} sections contributed to this assessment.`}
          </p>
        </Card>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1fr_360px]">
        <Card className="p-6">
          <h2 className="text-lg font-semibold">Top Issues</h2>
          <p className="mt-2 text-sm text-slate-400">Why?</p>
          <div className="mt-5 space-y-3">
            {topIssues.map((reason, index) => (
              <div key={reason} className="rounded-md border border-ink-700 bg-ink-950 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Issue {index + 1}</p>
                <p className="mt-2 text-sm leading-6 text-slate-300">{reason}</p>
              </div>
            ))}
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="text-lg font-semibold">Writing Characteristics</h2>
            <p className="mt-2 text-sm text-slate-400">Higher is better.</p>
            <div className="mt-5 space-y-4">
              {writingCharacteristics.map(([label, value]) => (
                <div key={label} className="flex items-center justify-between border-b border-ink-700 pb-3 last:border-b-0 last:pb-0">
                  <span className="text-sm text-slate-300">{label}</span>
                  <span className="text-lg font-semibold">{formatScore(value)}</span>
                </div>
              ))}
            </div>
          </Card>

          {humanEvidence.length > 0 && (
            <Card className="p-6">
              <h2 className="text-lg font-semibold">Human Authorship Evidence</h2>
              <div className="mt-4 space-y-3">
                {humanEvidence.map((evidence) => (
                  <p key={evidence} className="text-sm leading-6 text-slate-400">{evidence}</p>
                ))}
              </div>
            </Card>
          )}
        </div>
      </section>

      <RecommendedImprovements analysisId={analysis.id} paragraphs={result.paragraphs} />

      <Feedback analysisId={analysis.id} />
    </Shell>
  );
}
