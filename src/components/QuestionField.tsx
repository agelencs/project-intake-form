"use client";

import type { FormAnswers, QuestionDef } from "@/lib/types";

type Props = {
  question: QuestionDef;
  value: string | string[] | undefined;
  onChange: (id: string, value: string | string[]) => void;
};

function toggleMulti(
  current: string[],
  option: string,
  maxSelect?: number,
): string[] {
  if (current.includes(option)) {
    return current.filter((o) => o !== option);
  }
  if (maxSelect && current.length >= maxSelect) {
    return current;
  }
  if (option === "None of these") {
    return [option];
  }
  const withoutNone = current.filter((o) => o !== "None of these");
  return [...withoutNone, option];
}

export function QuestionField({ question, value, onChange }: Props) {
  const { id, title, helper, type, options, placeholder, maxSelect } = question;

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor={id} className="block text-sm font-medium text-slate-900">
          {title}
          {question.required && <span className="ml-1 text-rose-500">*</span>}
        </label>
        {helper && (
          <p className="mt-1 text-sm text-slate-500">{helper}</p>
        )}
        {maxSelect && (
          <p className="mt-0.5 text-xs text-slate-400">
            Select up to {maxSelect}
          </p>
        )}
      </div>

      {(type === "text" || type === "email" || type === "number") && (
        <input
          id={id}
          type={type === "number" ? "text" : type}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(id, e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
        />
      )}

      {type === "textarea" && (
        <textarea
          id={id}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(id, e.target.value)}
          placeholder={placeholder}
          rows={3}
          className="w-full resize-y rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
        />
      )}

      {type === "single" && options && (
        <div className="space-y-2">
          {options.map((option) => (
            <label
              key={option}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition-colors ${
                value === option
                  ? "border-slate-900 bg-slate-50"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <input
                type="radio"
                name={id}
                value={option}
                checked={value === option}
                onChange={() => onChange(id, option)}
                className="mt-0.5 h-4 w-4 border-slate-300 text-slate-900 focus:ring-slate-400"
              />
              <span className="text-sm text-slate-700">{option}</span>
            </label>
          ))}
        </div>
      )}

      {type === "multi" && options && (
        <div className="space-y-2">
          {options.map((option) => {
            const selected = Array.isArray(value) && value.includes(option);
            const atMax =
              !!maxSelect &&
              Array.isArray(value) &&
              value.length >= maxSelect &&
              !selected;
            return (
              <label
                key={option}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition-colors ${
                  selected
                    ? "border-slate-900 bg-slate-50"
                    : atMax
                      ? "cursor-not-allowed border-slate-100 bg-slate-50 opacity-50"
                      : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  disabled={atMax}
                  onChange={() =>
                    onChange(
                      id,
                      toggleMulti(
                        Array.isArray(value) ? value : [],
                        option,
                        maxSelect,
                      ),
                    )
                  }
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                />
                <span className="text-sm text-slate-700">{option}</span>
              </label>
            );
          })}
        </div>
      )}

      {type === "steps" && (
        <ProcessStepsField
          value={Array.isArray(value) ? value : ["", "", "", "", ""]}
          onChange={(steps) => onChange(id, steps)}
        />
      )}
    </div>
  );
}

function ProcessStepsField({
  value,
  onChange,
}: {
  value: string[];
  onChange: (steps: string[]) => void;
}) {
  const steps = [...value];
  while (steps.length < 5) steps.push("");

  return (
    <div className="space-y-2">
      {steps.map((step, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
            {i + 1}
          </span>
          <input
            type="text"
            value={step}
            onChange={(e) => {
              const next = [...steps];
              next[i] = e.target.value;
              onChange(next);
            }}
            placeholder={`Step ${i + 1}${i === 0 ? " — what triggers this?" : ""}`}
            className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
          />
        </div>
      ))}
    </div>
  );
}

export function validateStep(
  questions: QuestionDef[],
  answers: FormAnswers,
): string | null {
  for (const q of questions) {
    if (!q.required) continue;
    const val = answers[q.id];
    if (q.type === "multi" || q.type === "steps") {
      const arr = Array.isArray(val) ? val.filter(Boolean) : [];
      if (arr.length === 0) return `Please answer: ${q.title}`;
      if (q.type === "steps" && arr.length < 3) {
        return "Please provide at least 3 process steps";
      }
    } else if (!val || (typeof val === "string" && !val.trim())) {
      return `Please answer: ${q.title}`;
    }
  }
  return null;
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
