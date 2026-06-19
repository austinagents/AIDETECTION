import { formatScore, normalizeScore } from "@/lib/scoring/normalizeScore";

export function ScoreBar({ label, value }: { label: string; value: number }) {
  const score = normalizeScore(value);
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-300">{label}</span>
        <span className="font-semibold text-slate-100">{formatScore(score)}</span>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-ink-700">
        <div className="h-1.5 rounded-full bg-slate-300" style={{ width: `${Math.max(4, Math.min(100, score))}%` }} />
      </div>
    </div>
  );
}
