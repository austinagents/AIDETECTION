import { RiskLabel } from "@/lib/types";

const tone: Record<RiskLabel, string> = {
  low: "border-risk-low/35 bg-risk-low/12 text-[#8BC794]",
  medium: "border-risk-medium/35 bg-risk-medium/12 text-[#D3B25F]",
  high: "border-risk-high/35 bg-risk-high/12 text-[#D98A8D]"
};

export function RiskBadge({ label }: { label: RiskLabel }) {
  return (
    <span className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-medium capitalize ${tone[label]}`}>
      {label} risk
    </span>
  );
}
