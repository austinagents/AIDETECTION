import { CheckCircle2, CircleDashed } from "lucide-react";
import { Shell } from "@/components/Shell";
import { Card } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
  const hasSupabase = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  return (
    <Shell>
      <h1 className="text-3xl font-semibold">Settings</h1>
      <p className="mt-2 text-sm text-slate-400">Environment and data controls for the MVP.</p>
      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <Status title="OpenAI API status" active={hasOpenAI} activeText="Configured" inactiveText="Using local preview scoring" />
        <Status title="Supabase status" active={hasSupabase} activeText="Configured" inactiveText="Using local development storage" />
        <Card className="p-6">
          <h2 className="font-semibold">Export data</h2>
          <p className="mt-2 text-sm text-slate-400">Export controls will be available after account storage is connected.</p>
          <button className="mt-5 rounded-md border border-ink-700 px-4 py-2.5 text-sm font-semibold text-slate-400" disabled>Export data</button>
        </Card>
        <Card className="p-6">
          <h2 className="font-semibold">Delete data</h2>
          <p className="mt-2 text-sm text-slate-400">Deletion controls will be connected with authenticated accounts.</p>
          <button className="mt-5 rounded-md border border-ink-700 px-4 py-2.5 text-sm font-semibold text-slate-400" disabled>Delete data</button>
        </Card>
      </div>
    </Shell>
  );
}

function Status({ title, active, activeText, inactiveText }: { title: string; active: boolean; activeText: string; inactiveText: string }) {
  const Icon = active ? CheckCircle2 : CircleDashed;
  return (
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{title}</h2>
        <Icon className={active ? "h-5 w-5 text-[#8BC794]" : "h-5 w-5 text-slate-500"} />
      </div>
      <p className="mt-3 text-sm text-slate-400">{active ? activeText : inactiveText}</p>
    </Card>
  );
}
