export function extractJson<T>(value: string): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    const match = value.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("OpenAI response did not include JSON.");
    return JSON.parse(match[0]) as T;
  }
}
