import { FileText, PenLine, ShieldCheck } from "lucide-react";
import { ButtonLink, Card, SecondaryLink } from "@/components/ui";

const cards = [
  {
    title: "Authenticity Score",
    body: "Review AI-like writing patterns with paragraph-level risk signals.",
    icon: ShieldCheck
  },
  {
    title: "Voice Profile",
    body: "Save samples to build a profile of your own tone, rhythm, and phrasing.",
    icon: PenLine
  },
  {
    title: "Revision Guidance",
    body: "Get explainable suggestions that make drafts more specific and personal.",
    icon: FileText
  }
];

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-ink-950 text-slate-50">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-8">
        <nav className="flex items-center justify-between border-b border-ink-700 pb-5">
          <div className="text-sm font-semibold tracking-wide">Writing Review</div>
          <div className="flex items-center gap-3">
            <SecondaryLink href="/dashboard">Dashboard</SecondaryLink>
            <ButtonLink href="/analysis/new">Start Analysis</ButtonLink>
          </div>
        </nav>

        <section className="flex flex-1 flex-col items-center justify-center py-20 text-center">
          <p className="mb-5 text-sm font-medium text-slate-400">Writing Review</p>
          <h1 className="max-w-3xl text-5xl font-semibold tracking-normal text-slate-50 md:text-6xl">
            Check if your writing sounds AI-generated.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
            Analyze AI-like writing patterns, identify risky sections, and improve drafts using your own writing style.
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <ButtonLink href="/analysis/new">Start Analysis</ButtonLink>
            <SecondaryLink href="/profile">Build My Writing Profile</SecondaryLink>
          </div>
        </section>

        <section className="grid gap-4 pb-10 md:grid-cols-3">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <Card key={card.title} className="p-6">
                <Icon className="h-5 w-5 text-slate-300" />
                <h2 className="mt-5 text-base font-semibold">{card.title}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">{card.body}</p>
              </Card>
            );
          })}
        </section>
      </div>
    </main>
  );
}
