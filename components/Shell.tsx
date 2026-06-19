import Link from "next/link";
import { BarChart3, History, PenLine, Settings, ShieldCheck } from "lucide-react";

const nav = [
  { href: "/dashboard", label: "Analysis", icon: BarChart3 },
  { href: "/profile", label: "Profile", icon: PenLine },
  { href: "/history", label: "History", icon: History },
  { href: "/settings", label: "Settings", icon: Settings }
];

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-ink-950 text-slate-50">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-ink-700 bg-ink-900/70 px-5 py-6 lg:block">
        <Link href="/" className="flex items-center gap-3 text-sm font-semibold tracking-wide text-slate-100">
          <span className="flex h-9 w-9 items-center justify-center rounded-md border border-ink-700 bg-ink-850">
            <ShieldCheck className="h-4 w-4" />
          </span>
          Writing Review
        </Link>
        <nav className="mt-10 space-y-1">
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm text-slate-300 transition hover:bg-ink-850 hover:text-white"
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <main className="lg:pl-64">
        <div className="mx-auto min-h-screen max-w-7xl px-5 py-6 sm:px-8 lg:px-10">{children}</div>
      </main>
    </div>
  );
}
