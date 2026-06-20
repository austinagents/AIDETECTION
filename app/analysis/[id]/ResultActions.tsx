"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Copy, ThumbsDown, ThumbsUp } from "lucide-react";
import { RiskBadge } from "@/components/RiskBadge";
import { Card } from "@/components/ui";
import { detectorRiskBand, formatScore } from "@/lib/scoring/normalizeScore";
import { ParagraphAnalysis } from "@/lib/types";

type RevisionImpact = {
  beforeScore: number;
  afterScore: number;
  improvement: number;
  improved: boolean;
  label: string;
};

type RevisionState = {
  revisedText: string;
  explanation: string;
  changes: string[];
  remainingIssues: string[];
  impact: RevisionImpact;
};

type CompletedImprovement = {
  paragraphIndex: number;
  originalText: string;
  latestRevisedText: string;
  latestAfterScore: number;
};

type FinalEssay = {
  text: string;
  score: number;
};

type SubmissionReadinessState = "Ready" | "Mostly Ready" | "Needs Work" | "High Risk";

export function RecommendedImprovements({
  analysisId,
  paragraphs
}: {
  analysisId: string;
  paragraphs: ParagraphAnalysis[];
}) {
  const recommended = useMemo(() => {
    const needsAttention = paragraphs.filter((paragraph) => paragraph.risk >= 40);
    return needsAttention.length ? needsAttention : paragraphs.slice(0, 1);
  }, [paragraphs]);
  const [completed, setCompleted] = useState<Set<number>>(new Set());
  const [completedImprovements, setCompletedImprovements] = useState<Record<number, CompletedImprovement>>({});
  const [finalEssay, setFinalEssay] = useState<FinalEssay | null>(null);
  const remaining = Math.max(0, recommended.length - completed.size);
  const readinessScore = recommended.length
    ? Math.round(
        recommended.reduce((sum, paragraph) => {
          return sum + (completedImprovements[paragraph.index]?.latestAfterScore ?? paragraph.risk);
        }, 0) / recommended.length
      )
    : 0;
  const readiness = submissionReadinessFromRisk(readinessScore);
  const canGenerateFinalEssay = recommended.length > 0 && completed.size === recommended.length;

  function markImproved(improvement: CompletedImprovement) {
    setCompleted((current) => {
      const next = new Set(current);
      next.add(improvement.paragraphIndex);
      return next;
    });
    setCompletedImprovements((current) => ({
      ...current,
      [improvement.paragraphIndex]: improvement
    }));
    setFinalEssay(null);
  }

  function generateFinalEssay() {
    const finalParagraphs = paragraphs.map((paragraph) => {
      return completedImprovements[paragraph.index]?.latestRevisedText ?? paragraph.text;
    });
    const afterScores = recommended
      .map((paragraph) => completedImprovements[paragraph.index]?.latestAfterScore)
      .filter((score): score is number => typeof score === "number");
    const averageScore = afterScores.length
      ? Math.round(afterScores.reduce((sum, score) => sum + score, 0) / afterScores.length)
      : 0;

    setFinalEssay({
      text: finalParagraphs.join("\n\n"),
      score: Math.max(0, Math.min(100, averageScore))
    });
  }

  return (
    <>
      <section className="mt-8">
        <h2 className="text-xl font-semibold">Recommended Improvements</h2>
        <p className="mt-2 text-sm text-slate-400">What should I fix?</p>
        <div className="mt-4 space-y-4">
          {recommended.map((paragraph, index) => (
            <ImprovementCard
              key={paragraph.index}
              analysisId={analysisId}
              paragraph={paragraph}
              label={`Improvement Opportunity ${index + 1}`}
              onImproved={markImproved}
            />
          ))}
          {!recommended.length && (
            <Card className="p-6">
              <p className="text-sm text-slate-300">No major improvement opportunities were detected.</p>
            </Card>
          )}
        </div>
      </section>

      <SubmissionReadiness
        state={readiness}
        score={readinessScore}
        remaining={remaining}
        total={recommended.length}
        canGenerateFinalEssay={canGenerateFinalEssay}
        finalEssayGenerated={Boolean(finalEssay)}
        onGenerateFinalEssay={generateFinalEssay}
      />

      {finalEssay && <FinalEssayOutput essay={finalEssay} />}
    </>
  );
}

function ImprovementCard({
  analysisId,
  paragraph,
  label,
  onImproved
}: {
  analysisId: string;
  paragraph: ParagraphAnalysis;
  label: string;
  onImproved: (improvement: CompletedImprovement) => void;
}) {
  const [displayedText, setDisplayedText] = useState(paragraph.text);
  const [currentScore, setCurrentScore] = useState(paragraph.risk);
  const [revision, setRevision] = useState<RevisionState | null>(null);
  const [revisionCount, setRevisionCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  async function revise() {
    setLoading(true);
    setError("");
    const nextRevisionCount = revisionCount + 1;
    try {
      const response = await fetch("/api/revise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysisId,
          paragraphIndex: paragraph.index,
          paragraph: displayedText,
          revisionType: "improve",
          revisionCount: nextRevisionCount,
          beforeScoreOverride: currentScore
        })
      });
      const data = await response.json();
      if (!response.ok) {
        const detail = data.details ? ` (${data.code}: ${data.details})` : data.code ? ` (${data.code})` : "";
        throw new Error(`${data.error || "Revision failed."}${detail}`);
      }
      setRevision({
        revisedText: data.revisedText,
        explanation: data.explanation,
        changes: Array.isArray(data.changes) ? data.changes.slice(0, 5) : [],
        remainingIssues: Array.isArray(data.remainingIssues) ? data.remainingIssues.slice(0, 5) : [],
        impact: data.impact
      });
      setRevisionCount(nextRevisionCount);
      if (typeof data.impact?.afterScore === "number") {
        setCurrentScore(data.impact.afterScore);
      }
      if (data.impact?.improved) {
        onImproved({
          paragraphIndex: paragraph.index,
          originalText: paragraph.text,
          latestRevisedText: data.revisedText,
          latestAfterScore: data.impact.afterScore
        });
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Revision failed.");
    } finally {
      setLoading(false);
    }
  }

  async function copyRevision() {
    if (!revision) return;
    await navigator.clipboard.writeText(revision.revisedText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <Card className={paragraph.riskLabel === "high" ? "border-risk-high/40 p-6" : "p-6"}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-300">{label}</p>
          <p className="mt-1 text-xs text-slate-500">Needs attention</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold">{formatScore(currentScore)}</span>
          <RiskBadge label={paragraph.riskLabel} />
        </div>
      </div>

      <div className="mt-5">
        <p className="text-sm font-medium text-slate-300">Original text</p>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-200">{displayedText}</p>
      </div>

      <div className="mt-5">
        <p className="text-sm font-medium text-slate-300">Why it matters</p>
        <ul className="mt-2 space-y-2 text-sm leading-6 text-slate-400">
          {paragraph.reasons.slice(0, 3).map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </div>

      <button
        onClick={revise}
        className="mt-5 rounded-md border border-ink-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={loading}
      >
        {loading ? "Working..." : "Improve this paragraph"}
      </button>

      {error && <p className="mt-3 text-sm text-[#D98A8D]">{error}</p>}

      {revision && (
        <div className="mt-5 space-y-4 rounded-md border border-ink-700 bg-ink-950 p-4">
          <div>
            <p className="text-sm font-medium text-slate-300">Revision Impact</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <ImpactStat label="Before" value={formatScore(revision.impact.beforeScore)} />
              <ImpactStat label="After" value={formatScore(revision.impact.afterScore)} />
              <ImpactStat label="Risk Reduction" value={revision.impact.improved ? `${revision.impact.improvement}%` : "No risk reduction detected"} />
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-slate-300">Suggested revision</p>
            <p className="mt-2 text-sm leading-7 text-slate-200">{revision.revisedText}</p>
            {revision.explanation && <p className="mt-3 text-xs leading-5 text-slate-500">{revision.explanation}</p>}
          </div>

          <div>
            <p className="text-sm font-medium text-slate-300">What Changed</p>
            <ul className="mt-2 space-y-2 text-sm leading-6 text-slate-400">
              {revision.changes.length
                ? revision.changes.map((change) => <li key={change}>{change}</li>)
                : ["Reduced generic phrasing", "Reduced academic cadence", "Reduced balanced summary structure"].map((change) => <li key={change}>{change}</li>)}
            </ul>
          </div>

          {revision.remainingIssues.length > 0 && (
            <div>
              <p className="text-sm font-medium text-slate-300">Remaining Issues</p>
              <ul className="mt-2 space-y-2 text-sm leading-6 text-slate-400">
                {revision.remainingIssues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              onClick={copyRevision}
              className="inline-flex items-center gap-2 rounded-md border border-ink-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-ink-800"
            >
              <Copy className="h-3.5 w-3.5" />
              {copied ? "Copied" : "Copy Revision"}
            </button>
            <button
              onClick={() => setDisplayedText(revision.revisedText)}
              className="rounded-md border border-ink-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-ink-800"
            >
              Replace Original
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

function ImpactStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-ink-700 bg-ink-850 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-100">{value}</p>
    </div>
  );
}

function SubmissionReadiness({
  state,
  score,
  remaining,
  total,
  canGenerateFinalEssay,
  finalEssayGenerated,
  onGenerateFinalEssay
}: {
  state: SubmissionReadinessState;
  score: number;
  remaining: number;
  total: number;
  canGenerateFinalEssay: boolean;
  finalEssayGenerated: boolean;
  onGenerateFinalEssay: () => void;
}) {
  const message =
    state === "Ready"
      ? "Estimated detector risk is in the ready range."
      : `${remaining} recommended ${remaining === 1 ? "improvement remains" : "improvements remain"}.`;

  return (
    <Card className="mt-8 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Submission Readiness</h2>
          <p className="mt-2 text-sm text-slate-400">Am I done?</p>
        </div>
        <span className="rounded-md border border-ink-700 px-3 py-1.5 text-sm font-semibold text-slate-100">{state}</span>
      </div>
      <p className="mt-4 text-sm text-slate-400">Estimated Detector Risk: {formatScore(score)}</p>
      <p className="mt-5 text-sm leading-6 text-slate-300">{message}</p>
      {state === "Ready" && total > 0 && (
        <p className="mt-3 inline-flex items-center gap-2 text-sm text-[#8BC794]">
          <CheckCircle2 className="h-4 w-4" />
          All recommended improvements completed.
        </p>
      )}
      {canGenerateFinalEssay && (
        <button
          onClick={onGenerateFinalEssay}
          className="mt-5 inline-flex items-center gap-2 rounded-md border border-ink-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-ink-800"
        >
          {finalEssayGenerated ? "Regenerate Final Essay" : "Generate Final Essay"}
        </button>
      )}
    </Card>
  );
}

function FinalEssayOutput({ essay }: { essay: FinalEssay }) {
  const [copied, setCopied] = useState(false);
  const riskLabel = riskLabelFromDetectorRisk(essay.score);
  const readiness = submissionReadinessFromRisk(essay.score);

  async function copyFinalEssay() {
    await navigator.clipboard.writeText(essay.text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <Card className="mt-8 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Final Essay</h2>
          <p className="mt-2 text-sm text-slate-400">Rewritten with your completed improvements.</p>
        </div>
        <RiskBadge label={riskLabel} />
      </div>

      <div className="mt-6 max-w-xs rounded-md border border-ink-700 bg-ink-950 p-4">
        <p className="text-sm text-slate-400">Estimated Detector Risk</p>
        <p className="mt-2 text-4xl font-semibold">{formatScore(essay.score)}</p>
        <p className="mt-2 text-sm text-slate-400">{detectorRiskBand(essay.score)} Risk · {readiness}</p>
      </div>

      <p className="mt-6 whitespace-pre-wrap text-sm leading-7 text-slate-200">{essay.text}</p>

      <button
        onClick={copyFinalEssay}
        className="mt-5 inline-flex items-center gap-2 rounded-md border border-ink-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-ink-800"
      >
        <Copy className="h-3.5 w-3.5" />
        {copied ? "Copied" : "Copy Final Essay"}
      </button>
    </Card>
  );
}

function riskLabelFromDetectorRisk(score: number) {
  if (score >= 70) return "high";
  if (score >= 41) return "medium";
  return "low";
}

function submissionReadinessFromRisk(score: number): SubmissionReadinessState {
  if (score <= 20) return "Ready";
  if (score <= 40) return "Mostly Ready";
  if (score <= 60) return "Needs Work";
  return "High Risk";
}

export function Feedback({ analysisId }: { analysisId: string }) {
  const [saved, setSaved] = useState(false);

  async function send(userRating: number) {
    await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ analysisId, userRating })
    });
    setSaved(true);
  }

  return (
    <div className="mt-8 flex items-center justify-between rounded-lg border border-ink-700 bg-ink-850 p-4">
      <p className="text-sm text-slate-300">{saved ? "Thanks for the feedback." : "Was this analysis helpful?"}</p>
      {!saved && (
        <div className="flex gap-2">
          <button aria-label="Helpful" onClick={() => send(1)} className="rounded-md border border-ink-700 p-2 hover:bg-ink-800"><ThumbsUp className="h-4 w-4" /></button>
          <button aria-label="Not helpful" onClick={() => send(-1)} className="rounded-md border border-ink-700 p-2 hover:bg-ink-800"><ThumbsDown className="h-4 w-4" /></button>
        </div>
      )}
    </div>
  );
}
