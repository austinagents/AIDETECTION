export function extractJson<T>(value: string): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    const match = value.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("OpenAI response did not include JSON.");
    return JSON.parse(match[0]) as T;
  }
}

export function clampScore(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, Math.round(number)));
}
