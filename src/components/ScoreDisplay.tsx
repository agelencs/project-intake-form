import type { Bucket, Confidence } from "@/lib/types";

const bucketStyles: Record<
  Bucket,
  { bg: string; text: string; ring: string }
> = {
  "do-first": {
    bg: "bg-emerald-50",
    text: "text-emerald-800",
    ring: "ring-emerald-200",
  },
  investigate: {
    bg: "bg-amber-50",
    text: "text-amber-800",
    ring: "ring-amber-200",
  },
  "easy-win": {
    bg: "bg-sky-50",
    text: "text-sky-800",
    ring: "ring-sky-200",
  },
  park: {
    bg: "bg-slate-100",
    text: "text-slate-600",
    ring: "ring-slate-200",
  },
};

export function BucketBadge({ bucket, label }: { bucket: Bucket; label: string }) {
  const style = bucketStyles[bucket];
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${style.bg} ${style.text} ${style.ring}`}
    >
      {label}
    </span>
  );
}

export function ScoreBar({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "risk";
}) {
  const color =
    tone === "risk"
      ? value >= 60
        ? "bg-rose-500"
        : value >= 35
          ? "bg-amber-500"
          : "bg-slate-300"
      : value >= 70
        ? "bg-emerald-500"
        : value >= 45
          ? "bg-sky-500"
          : "bg-slate-300";

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="tabular-nums text-slate-500">{value}/100</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  const styles: Record<Confidence, string> = {
    high: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    medium: "bg-amber-50 text-amber-700 ring-amber-200",
    low: "bg-rose-50 text-rose-700 ring-rose-200",
  };
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ${styles[confidence]}`}
    >
      {confidence} confidence
    </span>
  );
}
