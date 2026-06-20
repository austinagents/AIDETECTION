import { notFound } from "next/navigation";
import { Shell } from "@/components/Shell";
import { RiskBadge } from "@/components/RiskBadge";
import { Card } from "@/components/ui";
import { LOCAL_USER_ID } from "@/lib/constants";
import { detectorRiskBand, formatScore, normalizeScore } from "@/lib/scoring/normalizeScore";
import { getStorage } from "@/lib/storage";
import { Feedback, RecommendedImprovements } from "./ResultActions";

export default async function AnalysisResultPage({ params }: { params: { id: string } }) {
  const storage = getStorage();
  const analysis = await storage.getAnalysis(LOCAL_USER_ID, params.id);
  if (!analysis) notFound();

  const result = analysis.result;
  const detectionRisk = normalizeScore(result.overallRisk);
  const detectionContributors = result.paragraphs.filter((paragraph) => paragraph.risk >= 40).length;
  const riskFactors = [
    ["Textbook Cadence", result.scores.textbookCadence],
    ["Professionalized Tone", result.scores.professionalizedWritingBias],
    ["Generic Framing", result.scores.genericPhrasing],
    ["Predictable Structure", result.scores.predictableStructure],
    ["Balanced Structure", result.scores.balancedConstruction],
    ["Abstract Noun Density", result.scores.abstractNounDensity],
    ["Smooth Certainty", result.scores.smoothCertainty]
  ] as const;
  const topIssues = (result.detectorSignals?.length ? result.detectorSignals : result.mainReasons).slice(0, 3);
  const detectorSignals = result.documentEvidence?.length ? result.documentEvidence.slice(0, 3) : topIssues;

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
          <p className="text-sm text-slate-400">AI Detection Risk</p>
          <div className="mt-4 flex items-end gap-4">
            <span className="text-7xl font-semibold leading-none">{formatScore(detectionRisk)}</span>
            <span className="pb-2 text-sm text-slate-400">{detectorRiskBand(detectionRisk)} Risk</span>
          </div>
          <p className="mt-6 text-sm leading-6 text-slate-300">{result.summary}</p>
        </Card>

        <Card className="p-7">
          <p className="text-sm text-slate-400">Detection Risk</p>
          <p className="mt-4 text-4xl font-semibold">{detectorRiskBand(detectionRisk)}</p>
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
            <h2 className="text-lg font-semibold">Risk Factors</h2>
            <p className="mt-2 text-sm text-slate-400">Higher means more detector risk.</p>
            <div className="mt-5 space-y-4">
              {riskFactors.map(([label, value]) => (
                <div key={label} className="flex items-center justify-between border-b border-ink-700 pb-3 last:border-b-0 last:pb-0">
                  <span className="text-sm text-slate-300">{label}</span>
                  <span className="text-lg font-semibold">{formatScore(value)}</span>
                </div>
              ))}
            </div>
          </Card>

          {detectorSignals.length > 0 && (
            <Card className="p-6">
              <h2 className="text-lg font-semibold">Detector Signals</h2>
              <div className="mt-4 space-y-3">
                {detectorSignals.map((evidence) => (
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
