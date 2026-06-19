import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Card } from "@/components/ui";
import { RiskBadge } from "@/components/RiskBadge";
import { LOCAL_USER_ID } from "@/lib/constants";
import { formatScore } from "@/lib/scoring/normalizeScore";
import { getStorage } from "@/lib/storage";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const analyses = await getStorage().listAnalyses(LOCAL_USER_ID);
  return (
    <Shell>
      <h1 className="text-3xl font-semibold">History</h1>
      <p className="mt-2 text-sm text-slate-400">Past writing reviews and authenticity scores.</p>
      <Card className="mt-8 overflow-hidden">
        <div className="grid grid-cols-[1fr_140px_120px_120px] border-b border-ink-700 px-5 py-3 text-xs font-medium uppercase tracking-wide text-slate-500">
          <span>Title</span>
          <span>Date</span>
          <span>Type</span>
          <span>Score</span>
        </div>
        {analyses.map((item) => (
          <Link key={item.id} href={`/analysis/${item.id}`} className="grid grid-cols-[1fr_140px_120px_120px] items-center border-b border-ink-700 px-5 py-4 last:border-b-0 hover:bg-ink-800/60">
            <span className="font-medium">{item.title}</span>
            <span className="text-sm text-slate-400">{new Date(item.createdAt).toLocaleDateString()}</span>
            <span className="text-sm text-slate-400">{item.contentType}</span>
            <span className="flex items-center gap-3"><b>{formatScore(item.overallRisk)}</b><RiskBadge label={item.riskLabel} /></span>
          </Link>
        ))}
        {!analyses.length && <p className="px-5 py-10 text-sm text-slate-400">No analysis history yet.</p>}
      </Card>
    </Shell>
  );
}
