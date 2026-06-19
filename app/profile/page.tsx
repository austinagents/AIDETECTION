"use client";

import { FormEvent, useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import { Card } from "@/components/ui";
import { ContentType, StyleProfile, WritingSample } from "@/lib/types";

const contentTypes: ContentType[] = ["Essay", "Social Post", "Blog Article", "Email", "Personal Statement", "Other"];

export default function ProfilePage() {
  const [profile, setProfile] = useState<StyleProfile | null>(null);
  const [samples, setSamples] = useState<WritingSample[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [contentType, setContentType] = useState<ContentType>("Other");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/style/profile")
      .then((response) => response.json())
      .then((data) => {
        setProfile(data.profile);
        setSamples(data.samples ?? []);
      })
      .catch(() => setError("Could not load writing profile."))
      .finally(() => setLoading(false));
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/style/sample", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content, contentType })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save sample.");
      setProfile(data.profile);
      setSamples((current) => [data.sample, ...current]);
      setTitle("");
      setContent("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save sample.");
    } finally {
      setSaving(false);
    }
  }

  const strength = samples.length >= 8 ? "Strong" : samples.length >= 3 ? "Developing" : "Needs samples";
  const words = samples.reduce((sum, sample) => sum + sample.content.split(/\s+/).filter(Boolean).length, 0);

  return (
    <Shell>
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Writing Profile</h1>
          <p className="mt-2 text-sm text-slate-400">A profile of your own tone, rhythm, phrasing, and writing habits.</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-slate-400">Strength</p>
          <p className="text-2xl font-semibold">{strength}</p>
        </div>
      </div>

      <section className="mt-8 grid gap-4 md:grid-cols-3">
        <Metric title="Samples" value={samples.length.toString()} />
        <Metric title="Words analyzed" value={words.toLocaleString()} />
        <Metric title="Profile" value={loading ? "Loading" : strength} />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1fr_380px]">
        <Card className="p-6">
          <h2 className="text-lg font-semibold">Current profile</h2>
          {profile ? (
            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <ProfileBlock title="Tone" items={[profile.tone, profile.sentenceLength, profile.vocabularyLevel]} />
              <ProfileBlock title="Common Patterns" items={profile.commonPatterns} />
              <ProfileBlock title="Writing Fingerprint" items={profile.styleRules} />
              <ProfileBlock title="Quirks" items={profile.quirks.length ? profile.quirks : ["More samples will reveal reliable quirks."]} />
              <div className="md:col-span-2">
                <p className="text-sm font-medium text-slate-300">Voice summary</p>
                <p className="mt-2 text-sm leading-6 text-slate-400">{profile.exampleVoiceSummary}</p>
              </div>
            </div>
          ) : (
            <p className="mt-5 text-sm text-slate-400">Loading profile...</p>
          )}
        </Card>

        <Card className="p-6">
          <h2 className="text-lg font-semibold">Add sample</h2>
          <form onSubmit={submit} className="mt-5 space-y-4">
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Sample title" className="w-full rounded-md border border-ink-700 bg-ink-950 px-3 py-2.5 text-sm outline-none" />
            <select value={contentType} onChange={(event) => setContentType(event.target.value as ContentType)} className="w-full rounded-md border border-ink-700 bg-ink-950 px-3 py-2.5 text-sm outline-none">
              {contentTypes.map((type) => <option key={type}>{type}</option>)}
            </select>
            <textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="Paste a writing sample..." className="min-h-44 w-full resize-none rounded-md border border-ink-700 bg-ink-950 px-3 py-3 text-sm leading-6 outline-none" />
            <button disabled={saving} className="w-full rounded-md bg-slate-100 px-4 py-3 text-sm font-semibold text-ink-950 disabled:opacity-60">
              {saving ? "Saving..." : "Save Writing Sample"}
            </button>
            {error && <p className="text-sm text-[#D98A8D]">{error}</p>}
          </form>
        </Card>
      </section>

      <Card className="mt-6 p-6">
        <h2 className="text-lg font-semibold">Saved samples</h2>
        <div className="mt-4 divide-y divide-ink-700">
          {samples.map((sample) => (
            <div key={sample.id} className="py-4">
              <p className="font-medium">{sample.title}</p>
              <p className="mt-1 text-sm text-slate-400">{sample.contentType} · {new Date(sample.createdAt).toLocaleDateString()}</p>
            </div>
          ))}
          {!samples.length && <p className="py-6 text-sm text-slate-400">No saved writing samples yet.</p>}
        </div>
      </Card>
    </Shell>
  );
}

function Metric({ title, value }: { title: string; value: string }) {
  return <Card className="p-5"><p className="text-sm text-slate-400">{title}</p><p className="mt-3 text-3xl font-semibold">{value}</p></Card>;
}

function ProfileBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-sm font-medium text-slate-300">{title}</p>
      <ul className="mt-2 space-y-2 text-sm text-slate-400">
        {items.filter(Boolean).map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  );
}
