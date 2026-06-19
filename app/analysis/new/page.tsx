"use client";

import { ChangeEvent, FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { Shell } from "@/components/Shell";
import { Card } from "@/components/ui";
import { ContentType } from "@/lib/types";

const contentTypes: ContentType[] = ["Essay", "Social Post", "Blog Article", "Email", "Personal Statement", "Other"];

export default function NewAnalysisPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [contentType, setContentType] = useState<ContentType>("Essay");
  const [useProfile, setUseProfile] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".txt")) {
      setError("For this MVP, upload a .txt file or paste your writing.");
      return;
    }
    setContent(await file.text());
    if (!title) setTitle(file.name.replace(/\.txt$/i, ""));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content, contentType, useProfile })
      });
      const data = await response.json();
      if (!response.ok) {
        const detail = data.details ? ` (${data.code}: ${data.details})` : data.code ? ` (${data.code})` : "";
        throw new Error(`${data.error || "Analysis failed."}${detail}`);
      }
      router.push(`/analysis/${data.analysis.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Analysis failed. Check the server health endpoint and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Shell>
      <form onSubmit={submit} className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <section>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Title"
            className="w-full border-b border-ink-700 bg-transparent px-1 py-4 text-3xl font-semibold outline-none placeholder:text-slate-600"
          />
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="Paste your writing..."
            className="document-scroll mt-6 min-h-[68vh] w-full resize-none rounded-lg border border-ink-700 bg-ink-900 px-5 py-5 text-base leading-8 text-slate-100 outline-none placeholder:text-slate-600 focus:border-slate-500"
          />
        </section>

        <aside className="space-y-4">
          <Card className="p-5">
            <label className="text-sm font-medium text-slate-300">Content Type</label>
            <select
              value={contentType}
              onChange={(event) => setContentType(event.target.value as ContentType)}
              className="mt-3 w-full rounded-md border border-ink-700 bg-ink-950 px-3 py-2.5 text-sm outline-none"
            >
              {contentTypes.map((type) => <option key={type}>{type}</option>)}
            </select>

            <label className="mt-5 flex items-center justify-between gap-4 text-sm text-slate-300">
              <span>Use my writing style profile for revision suggestions</span>
              <input
                type="checkbox"
                checked={useProfile}
                onChange={(event) => setUseProfile(event.target.checked)}
                className="h-5 w-5 accent-slate-100"
              />
            </label>
          </Card>

          <Card className="p-5">
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-ink-700 px-4 py-3 text-sm font-semibold text-slate-200 hover:bg-ink-800">
              <Upload className="h-4 w-4" />
              Upload .txt
              <input type="file" accept=".txt,text/plain" className="hidden" onChange={handleUpload} />
            </label>
            <button
              type="submit"
              disabled={loading}
              className="mt-4 w-full rounded-md bg-slate-100 px-4 py-3 text-sm font-semibold text-ink-950 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Analyzing..." : "Analyze Writing"}
            </button>
            {error && <p className="mt-4 rounded-md border border-risk-high/30 bg-risk-high/10 p-3 text-sm text-[#D98A8D]">{error}</p>}
          </Card>
        </aside>
      </form>
    </Shell>
  );
}
