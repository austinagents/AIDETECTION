"use client";

import { useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { ParagraphAnalysis } from "@/lib/types";

const actions = [
  { label: "Improve this paragraph", type: "improve" },
  { label: "Make this more specific", type: "specific" },
  { label: "Make this sound more like my writing profile", type: "profile" },
  { label: "Reduce generic phrasing", type: "generic" }
];

export function ParagraphActions({ analysisId, paragraph }: { analysisId: string; paragraph: ParagraphAnalysis }) {
  const [revision, setRevision] = useState("");
  const [explanation, setExplanation] = useState("");
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");

  async function revise(type: string) {
    setLoading(type);
    setError("");
    try {
      const response = await fetch("/api/revise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysisId,
          paragraphIndex: paragraph.index,
          paragraph: paragraph.text,
          revisionType: type
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Revision failed.");
      setRevision(data.revisedText);
      setExplanation(data.explanation);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Revision failed.");
    } finally {
      setLoading("");
    }
  }

  return (
    <div className="mt-5">
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <button
            key={action.type}
            onClick={() => revise(action.type)}
            className="rounded-md border border-ink-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-ink-800"
          >
            {loading === action.type ? "Working..." : action.label}
          </button>
        ))}
      </div>
      {error && <p className="mt-3 text-sm text-[#D98A8D]">{error}</p>}
      {revision && (
        <div className="mt-4 rounded-md border border-ink-700 bg-ink-950 p-4">
          <p className="text-sm font-medium text-slate-300">Suggested revision</p>
          <p className="mt-2 text-sm leading-7 text-slate-200">{revision}</p>
          {explanation && <p className="mt-3 text-xs leading-5 text-slate-500">{explanation}</p>}
        </div>
      )}
    </div>
  );
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
