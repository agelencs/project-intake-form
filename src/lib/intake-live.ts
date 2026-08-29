import { QUESTIONS } from "@/lib/questions";
import type { FieldStatus, FieldUpdate } from "@/lib/intake-session";

export const LIVE_MODEL = "gemini-3.1-flash-live-preview";
export const LIVE_TOOL_NAME = "update_intake_fields";

export type LiveToolParse = {
  updates: FieldUpdate[];
  understood: string[];
  followUpQuestion: string | null;
  screenObservation: string | null;
};

const STATUSES: FieldStatus[] = [
  "unanswered",
  "partial",
  "sufficient",
  "unclear",
];

function asStatus(value: unknown): FieldStatus {
  return STATUSES.includes(value as FieldStatus)
    ? (value as FieldStatus)
    : "sufficient";
}

function coerceValue(
  id: string,
  value: unknown,
): string | string[] | null {
  const question = QUESTIONS.find((q) => q.id === id);
  if (!question) return null;

  if (typeof value === "number") value = String(value);

  if (Array.isArray(value)) {
    const items = value.map((item) => String(item).trim()).filter(Boolean);
    if (question.type === "multi" || question.type === "steps") return items;
    return items.join("\n") || null;
  }

  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (question.type === "multi") {
    return trimmed
      .split(/\s*\|\s*|\s*;\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (question.type === "steps") {
    return trimmed
      .split(/\n|\s*\|\s*|\s*;\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return trimmed;
}

export function parseLiveToolArgs(
  args: Record<string, unknown> | undefined,
): LiveToolParse {
  const updates: FieldUpdate[] = [];
  const rawUpdates = Array.isArray(args?.updates) ? args.updates : [];

  for (const item of rawUpdates) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const id = typeof rec.id === "string" ? rec.id.trim() : "";
    if (!/^Q\d+$/.test(id)) continue;
    const value = coerceValue(id, rec.value);
    if (value === null) continue;
    const note = typeof rec.note === "string" ? rec.note : undefined;
    updates.push({ id, value, status: asStatus(rec.status), note });
  }

  const understood = Array.isArray(args?.understood)
    ? args.understood
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 8)
    : [];

  const followUp =
    typeof args?.followUpQuestion === "string"
      ? args.followUpQuestion.trim() || null
      : null;
  const screenObservation =
    typeof args?.screenObservation === "string"
      ? args.screenObservation.trim() || null
      : null;

  return { updates, understood, followUpQuestion: followUp, screenObservation };
}
