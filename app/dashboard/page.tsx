import Link from "next/link";
import { Plus } from "lucide-react";
import { Card } from "@/components/ui";
import { Shell } from "@/components/Shell";
import { RiskBadge } from "@/components/RiskBadge";
import { LOCAL_USER_ID } from "@/lib/constants";
import { getStorage } from "@/lib/storage";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const storage = getStorage();
  const [analyses, samples, profile] = await Promise.all([
    storage.listAnalyses(LOCAL_USER_ID),
    storage.listWritingSamples(LOCAL_USER_ID),
    storage.getStyleProfile(LOCAL_USER_ID)
  ]);
  const averageRisk = analyses.length ? Math.round(analyses.reduce((sum, item) => sum + item.overallRisk, 0) / analyses.length) : 0;
  const strength = samples.length >= 8 ? "Strong" : samples.length >= 3 ? "Developing" : "Needs samples";

  return (
    <Shell>
      <div className="flex items-start justify-between gap-6">
        <div>
          <p className="text-sm text-slate-400">Good evening, Austin</p>
          <h1 className="mt-2 text-3xl font-semibold">Dashboard</h1>
        </div>
        <Link href="/analysis/new" className="inline-flex items-center gap-2 rounded-md bg-slate-100 px-4 py-2.5 text-sm font-semibold text-ink-950 hover:bg-white">
          <Plus className="h-4 w-4" />
          New Analysis
        </Link>
      </div>

      <section className="mt-8 grid gap-4 md:grid-cols-4">
        <Stat title="Analyses" value={analyses.length.toString()} />
        <Stat title="Writing samples" value={samples.length.toString()} />
        <Stat title="Average risk" value={analyses.length ? `${averageRisk}` : "—"} />
        <Stat title="Profile strength" value={strength} />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recent analyses</h2>
            <Link href="/history" className="text-sm text-slate-400 hover:text-white">View all</Link>
          </div>
          <div className="mt-5 divide-y divide-ink-700">
            {analyses.slice(0, 5).map((item) => (
              <Link key={item.id} href={`/analysis/${item.id}`} className="flex items-center justify-between gap-4 py-4">
                <div>
                  <p className="font-medium">{item.title}</p>
                  <p className="mt-1 text-sm text-slate-400">{item.contentType} · {new Date(item.createdAt).toLocaleDateString()}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xl font-semibold">{item.overallRisk}</span>
                  <RiskBadge label={item.riskLabel} />
                </div>
              </Link>
            ))}
            {!analyses.length && <p className="py-8 text-sm text-slate-400">No analyses yet. Start with a draft you want to review.</p>}
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-lg font-semibold">Writing Profile</h2>
          <p className="mt-3 text-3xl font-semibold">{strength}</p>
          <p className="mt-3 text-sm leading-6 text-slate-400">{profile?.profile.exampleVoiceSummary ?? "Add samples to build a useful personal voice profile."}</p>
          <Link href="/profile" className="mt-6 inline-flex rounded-md border border-ink-700 px-4 py-2.5 text-sm font-semibold text-slate-100 hover:bg-ink-800">
            Add Writing Sample
          </Link>
        </Card>
      </section>
    </Shell>
  );
}

function Stat({ title, value }: { title: string; value: string }) {
  return (
    <Card className="p-5">
      <p className="text-sm text-slate-400">{title}</p>
      <p className="mt-3 text-3xl font-semibold">{value}</p>
    </Card>
  );
}
