import { RiskLabel } from "@/lib/types";

type NormalizeOptions = {
  fallback?: number;
  scale?: "auto" | "decimal" | "percentage";
};

export function normalizeScore(value: unknown, options: NormalizeOptions = {}): number {
  const fallback = options.fallback ?? 0;
  const parsed = parseScore(value);
  if (!parsed.valid) return clampPercent(fallback);

  if (options.scale === "decimal") return clampPercent(parsed.value * 100);
  if (options.scale === "percentage") return clampPercent(parsed.value);

  if (parsed.wasPercentString) return clampPercent(parsed.value);
  if (parsed.value > 0 && parsed.value < 1) return clampPercent(parsed.value * 100);
  if (parsed.value === 1 && parsed.wasDecimalString) return 100;
  return clampPercent(parsed.value);
}

export function normalizeScoreGroup(values: unknown[], fallback = 0): number[] {
  const decimalScale = inferScoreScale(values) === "decimal";

  return values.map((value) =>
    normalizeScore(value, {
      fallback,
      scale: decimalScale ? "decimal" : "auto"
    })
  );
}

export function inferScoreScale(values: unknown[]): "decimal" | "percentage" {
  const parsed = values.map(parseScore);
  const valid = parsed.filter((item) => item.valid && !item.wasPercentString);
  const decimalScale =
    valid.length > 1 &&
    valid.every((item) => item.value >= 0 && item.value <= 1) &&
    valid.some((item) => item.value > 0 || item.wasDecimalString);

  return decimalScale ? "decimal" : "percentage";
}

export function riskLabelFromRiskScore(score: number): RiskLabel {
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  return "low";
}

export function formatScore(score: number) {
  return `${normalizeScore(score)}%`;
}

export function detectorRiskBand(score: number) {
  const normalized = normalizeScore(score);
  if (normalized <= 20) return "Very Low";
  if (normalized <= 40) return "Low";
  if (normalized <= 60) return "Moderate";
  if (normalized <= 80) return "High";
  return "Very High";
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function parseScore(value: unknown) {
  if (typeof value === "number") {
    return {
      value,
      valid: Number.isFinite(value),
      wasDecimalString: false,
      wasPercentString: false
    };
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    const wasPercentString = trimmed.endsWith("%");
    const numeric = trimmed.replace(/%$/, "");
    const parsed = Number(numeric);
    return {
      value: parsed,
      valid: Number.isFinite(parsed),
      wasDecimalString: numeric.includes("."),
      wasPercentString
    };
  }

  return {
    value: 0,
    valid: false,
    wasDecimalString: false,
    wasPercentString: false
  };
}
