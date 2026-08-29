import { QUESTIONS, STEPS } from "./questions";
import type { FormAnswers, QuestionDef } from "./types";

export type FieldStatus =
  | "unanswered"
  | "partial"
  | "sufficient"
  | "unclear";

export type FieldUpdate = {
  id: string;
  value: string | string[];
  status: FieldStatus;
  note?: string;
};

export type AnalyzeOutput = {
  updates: FieldUpdate[];
  followUpQuestion: string | null;
  keepListening: boolean;
  understood: string[];
  screenObservation?: string;
};

export type ReviewPayload = {
  answers: FormAnswers;
  statuses: Record<string, FieldStatus>;
  notes: Record<string, string>;
  understood: string[];
};

export const REVIEW_STORAGE_KEY = "intake-explain-review";

const CONDITIONAL_HINTS: Record<string, string> = {
  Q29: 'Only relevant if Q28 is "Sometimes" or "Most of the time".',
  Q30: 'Only relevant if Q28 is "Sometimes" or "Most of the time".',
  Q39: "Only relevant if Q38 includes personal details, money/invoices, or contracts.",
};

export function isQuestionVisible(
  question: QuestionDef,
  answers: FormAnswers,
): boolean {
  if (!question.showIf) return true;
  return question.showIf(answers);
}

export function visibleQuestions(answers: FormAnswers): QuestionDef[] {
  return QUESTIONS.filter((q) => isQuestionVisible(q, answers));
}

export function buildQuestionCatalog(): string {
  return QUESTIONS.map((q) => {
    const step = STEPS.find((s) => s.id === q.step);
    const bits = [
      q.id,
      `step ${q.step} (${step?.name ?? ""})`,
      q.type,
      q.required ? "required" : "optional",
      q.title,
    ];
    if (q.helper) bits.push(`helper: ${q.helper}`);
    if (q.options) bits.push(`options: ${q.options.join(" | ")}`);
    if (q.maxSelect) bits.push(`maxSelect: ${q.maxSelect}`);
    if (CONDITIONAL_HINTS[q.id]) bits.push(CONDITIONAL_HINTS[q.id]);
    return bits.join(" — ");
  }).join("\n");
}

export function hasValue(value: string | string[] | undefined): boolean {
  if (value === undefined) return false;
  if (Array.isArray(value)) return value.some((v) => v.trim() !== "");
  return value.trim() !== "";
}

export function isFieldAnswered(
  question: QuestionDef,
  value: string | string[] | undefined,
): boolean {
  if (!hasValue(value)) return false;
  if (question.type === "steps") {
    const arr = Array.isArray(value) ? value.filter((v) => v.trim()) : [];
    return arr.length >= 3;
  }
  if (question.type === "multi") {
    const arr = Array.isArray(value) ? value.filter(Boolean) : [];
    return arr.length > 0;
  }
  return typeof value === "string" && value.trim().length > 0;
}

export function formatStateForPrompt(
  answers: FormAnswers,
  statuses: Record<string, FieldStatus>,
  notes: Record<string, string>,
): string {
  return visibleQuestions(answers)
    .map((q) => {
      const status = statuses[q.id] ?? "unanswered";
      const raw = answers[q.id];
      let shown = "—";
      if (Array.isArray(raw)) {
        const filled = raw.filter((v) => v && v.trim());
        shown = filled.length ? filled.join(" · ") : "—";
      } else if (typeof raw === "string" && raw.trim()) {
        shown = raw;
      }
      const note = notes[q.id] ? ` | note: ${notes[q.id]}` : "";
      return `${q.id} [${status}] ${q.title}: ${shown}${note}`;
    })
    .join("\n");
}

function matchOption(value: string, options: string[]): string | null {
  const trimmed = value.trim();
  const exact = options.find((o) => o === trimmed);
  if (exact) return exact;
  const lower = trimmed.toLowerCase();
  return options.find((o) => o.toLowerCase() === lower) ?? null;
}

function normalizeValue(
  question: QuestionDef,
  value: string | string[],
): string | string[] | null {
  if (question.type === "multi") {
    const incoming = Array.isArray(value) ? value : [value];
    const options = question.options ?? [];
    const matched = incoming
      .map((item) => matchOption(item, options))
      .filter((item): item is string => item !== null);
    const unique = [...new Set(matched)];
    if (question.maxSelect) return unique.slice(0, question.maxSelect);
    if (unique.includes("None of these")) return ["None of these"];
    return unique;
  }

  if (question.type === "steps") {
    const incoming = Array.isArray(value) ? value : value.split(/\n|;/).map((s) => s.trim());
    const cleaned = incoming.map((s) => s.trim()).filter(Boolean);
    while (cleaned.length < 5) cleaned.push("");
    return cleaned.slice(0, 8);
  }

  if (question.type === "single") {
    const raw = Array.isArray(value) ? value[0] : value;
    if (!raw) return null;
    const matched = matchOption(raw, question.options ?? []);
    return matched;
  }

  const raw = Array.isArray(value) ? value.filter(Boolean).join("\n") : value;
  const trimmed = raw.trim();
  return trimmed ? trimmed : null;
}

export function emptyStatuses(): Record<string, FieldStatus> {
  const statuses: Record<string, FieldStatus> = {};
  for (const q of QUESTIONS) statuses[q.id] = "unanswered";
  return statuses;
}

export function applyUpdates(
  current: FormAnswers,
  statuses: Record<string, FieldStatus>,
  notes: Record<string, string>,
  updates: FieldUpdate[],
): {
  answers: FormAnswers;
  statuses: Record<string, FieldStatus>;
  notes: Record<string, string>;
} {
  const answers: FormAnswers = { ...current };
  const nextStatuses = { ...statuses };
  const nextNotes = { ...notes };
  const byId = new Map(QUESTIONS.map((q) => [q.id, q]));

  for (const update of updates) {
    const question = byId.get(update.id);
    if (!question) continue;
    if (!isQuestionVisible(question, answers) && question.showIf) {
      continue;
    }

    const normalized = normalizeValue(question, update.value);
    if (normalized === null) {
      if (update.status === "unclear" && update.note) {
        nextStatuses[update.id] = "unclear";
        nextNotes[update.id] = update.note;
      }
      continue;
    }

    if (question.type === "multi" && Array.isArray(normalized) && normalized.length === 0) {
      if (update.status === "unclear" && update.note) {
        nextStatuses[update.id] = "unclear";
        nextNotes[update.id] = update.note;
      }
      continue;
    }

    answers[update.id] = normalized;
    nextStatuses[update.id] = update.status;
    if (update.note) nextNotes[update.id] = update.note;
    else if (update.status === "sufficient") delete nextNotes[update.id];
  }

  return { answers, statuses: nextStatuses, notes: nextNotes };
}

export function reviewSummary(
  answers: FormAnswers,
  statuses: Record<string, FieldStatus>,
  notes: Record<string, string>,
) {
  const visible = visibleQuestions(answers);
  const missing = visible.filter((q) => {
    if (!q.required) return false;
    const status = statuses[q.id];
    if (status === "sufficient" && isFieldAnswered(q, answers[q.id])) return false;
    return !isFieldAnswered(q, answers[q.id]);
  });
  const unclear = visible.filter((q) => statuses[q.id] === "unclear");
  const filled = visible.filter((q) => isFieldAnswered(q, answers[q.id]));

  return {
    visibleCount: visible.length,
    filledCount: filled.length,
    missing,
    unclear,
    notes,
  };
}

export function firstIncompleteStep(
  answers: FormAnswers,
  statuses: Record<string, FieldStatus>,
): number {
  const { missing, unclear } = reviewSummary(answers, statuses, {});
  const target = missing[0] ?? unclear[0];
  return target?.step ?? 1;
}

export function emptyAnswers(): FormAnswers {
  return {
    Q20: ["", "", "", "", ""],
    Q21: [],
    Q17: [],
    Q33: [],
    Q38: [],
    Q42: [],
    Q43: [],
    Q44: [],
    Q46: [],
  };
}

export function mergeWithEmpty(answers: FormAnswers): FormAnswers {
  return { ...emptyAnswers(), ...answers };
}
