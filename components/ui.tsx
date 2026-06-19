import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function Card({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <div className={`rounded-lg border border-ink-700 bg-ink-850 ${className}`}>{children}</div>;
}

export function ButtonLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center justify-center gap-2 rounded-md bg-slate-100 px-4 py-2.5 text-sm font-semibold text-ink-950 transition hover:bg-white"
    >
      {children}
      <ArrowRight className="h-4 w-4" />
    </Link>
  );
}

export function SecondaryLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center justify-center rounded-md border border-ink-700 px-4 py-2.5 text-sm font-semibold text-slate-100 transition hover:bg-ink-850"
    >
      {children}
    </Link>
  );
}
