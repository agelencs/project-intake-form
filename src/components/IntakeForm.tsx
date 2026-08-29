"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getQuestionsForStep, STEPS } from "@/lib/questions";
import type { FormAnswers, Submission } from "@/lib/types";
import {
  emptyAnswers,
  QuestionField,
  validateStep,
} from "@/components/QuestionField";
import {
  BucketBadge,
  ConfidenceBadge,
  ScoreBar,
} from "@/components/ScoreDisplay";
import {
  REVIEW_STORAGE_KEY,
  firstIncompleteStep,
  mergeWithEmpty,
  reviewSummary,
  type FieldStatus,
  type ReviewPayload,
} from "@/lib/intake-session";

export function IntakeForm() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [answers, setAnswers] = useState<FormAnswers>(emptyAnswers());
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Submission | null>(null);
  const [review, setReview] = useState<ReviewPayload | null>(null);

  // Hydrate from the explain session after SSR. sessionStorage is not available on the server.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(REVIEW_STORAGE_KEY);
      if (!raw) return;
      const payload = JSON.parse(raw) as ReviewPayload;
      sessionStorage.removeItem(REVIEW_STORAGE_KEY);
      const nextAnswers = mergeWithEmpty(payload.answers ?? {});
      /* eslint-disable react-hooks/set-state-in-effect -- client-only session restore */
      setAnswers(nextAnswers);
      setReview(payload);
      setStep(firstIncompleteStep(nextAnswers, payload.statuses ?? {}));
      /* eslint-enable react-hooks/set-state-in-effect */
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      sessionStorage.removeItem(REVIEW_STORAGE_KEY);
    }
  }, []);

  const currentStep = STEPS.find((s) => s.id === step)!;
  const questions = getQuestionsForStep(step, answers);
  const progress = (step / STEPS.length) * 100;
  const reviewMeta = review
    ? reviewSummary(answers, review.statuses ?? {}, review.notes ?? {})
    : null;

  function fieldHighlight(id: string) {
    if (!review) return undefined;
    const status = review.statuses?.[id] as FieldStatus | undefined;
    if (status === "unclear") return "unclear" as const;
    if (reviewMeta?.missing.some((q) => q.id === id)) return "missing" as const;
    return undefined;
  }

  function handleChange(id: string, value: string | string[]) {
    setAnswers((prev) => ({ ...prev, [id]: value }));
    setError(null);
    setReview((prev) => {
      if (!prev) return prev;
      const nextNotes = { ...prev.notes };
      delete nextNotes[id];
      return {
        ...prev,
        statuses: { ...prev.statuses, [id]: "sufficient" },
        notes: nextNotes,
      };
    });
  }

  function handleNext() {
    const err = validateStep(questions, answers);
    if (err) {
      setError(err);
      return;
    }
    if (step < STEPS.length) {
      setStep(step + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function handleBack() {
    if (step > 1) {
      setStep(step - 1);
      setError(null);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  async function handleSubmit() {
    const err = validateStep(questions, answers);
    if (err) {
      setError(err);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(answers),
      });
      if (!res.ok) throw new Error("Submit failed");
      const submission = (await res.json()) as Submission;
      setResult(submission);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setError("Something went wrong saving your submission. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    const { score } = result;
    return (
      <div className="mx-auto max-w-3xl space-y-8">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
            <svg className="h-7 w-7 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Submission received
          </h1>
          <p className="mt-2 text-slate-500">
            {(result.answers.Q6 as string) || "Your opportunity"} has been scored and added to the backlog.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <BucketBadge bucket={score.bucket} label={score.bucketLabel} />
            <ConfidenceBadge confidence={score.confidence} />
          </div>

          <div className="mb-8 grid gap-5 sm:grid-cols-2">
            <ScoreBar label="Impact" value={score.impactScore} />
            <ScoreBar label="Feasibility" value={score.feasibilityScore} />
            <ScoreBar label="Risk" value={score.riskScore} tone="risk" />
          </div>

          <div className="mb-8 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Estimated volume
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
                {score.hoursPerYear.toLocaleString()} hrs/yr
              </p>
              <p className="text-sm text-slate-500">
                ~{score.hoursPerWeek} hrs/week across the team
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Recommended scope
              </p>
              <p className="mt-1 text-sm leading-relaxed text-slate-700">
                {score.recommendedScope}
              </p>
            </div>
          </div>

          {score.feedback.length > 0 && (
            <div className="mb-6 space-y-3">
              <h3 className="text-sm font-semibold text-slate-900">Feedback</h3>
              {score.feedback.map((line, i) => (
                <p
                  key={i}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-700"
                >
                  {line}
                </p>
              ))}
            </div>
          )}

          {score.flags.length > 0 && (
            <div className="mb-6">
              <h3 className="mb-2 text-sm font-semibold text-slate-900">Flags</h3>
              <div className="flex flex-wrap gap-2">
                {score.flags.map((flag) => (
                  <span
                    key={flag}
                    className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-200"
                  >
                    {flag}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="button"
              onClick={() => router.push(`/dashboard/${result.id}`)}
              className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800"
            >
              View full details
            </button>
            <button
              type="button"
              onClick={() => router.push("/dashboard")}
              className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              Go to dashboard
            </button>
            <button
              type="button"
              onClick={() => {
              setResult(null);
              setReview(null);
              setStep(1);
              setAnswers(emptyAnswers());
              }}
              className="rounded-lg px-5 py-2.5 text-sm font-medium text-slate-500 transition-colors hover:text-slate-700"
            >
              Submit another
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      {reviewMeta && (
        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">
            Review what we captured
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {reviewMeta.filledCount} of {reviewMeta.visibleCount} visible fields have
            enough to review. Edit anything below, then submit as usual.
          </p>
          {reviewMeta.missing.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-rose-600">
                Still needed
              </p>
              <ul className="mt-2 space-y-1 text-sm text-slate-700">
                {reviewMeta.missing.slice(0, 8).map((q) => (
                  <li key={q.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setStep(q.step);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      className="text-left hover:underline"
                    >
                      {q.title}
                    </button>
                  </li>
                ))}
                {reviewMeta.missing.length > 8 && (
                  <li className="text-slate-400">
                    +{reviewMeta.missing.length - 8} more
                  </li>
                )}
              </ul>
            </div>
          )}
          {reviewMeta.unclear.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                Please clarify
              </p>
              <ul className="mt-2 space-y-2 text-sm text-slate-700">
                {reviewMeta.unclear.map((q) => (
                  <li key={q.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setStep(q.step);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      className="text-left font-medium hover:underline"
                    >
                      {q.title}
                    </button>
                    {review?.notes?.[q.id] && (
                      <p className="text-slate-500">{review.notes[q.id]}</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="mb-8">
        <div className="mb-4 flex items-center justify-between text-sm">
          <span className="font-medium text-slate-900">
            Step {step} of {STEPS.length}
          </span>
          <span className="text-slate-500">{currentStep.name}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-slate-900 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="mt-3 text-sm text-slate-500">{currentStep.description}</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="space-y-8">
          {questions.map((q) => (
            <QuestionField
              key={q.id}
              question={q}
              value={answers[q.id]}
              onChange={handleChange}
              highlight={fieldHighlight(q.id)}
            />
          ))}
        </div>

        {error && (
          <div className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        <div className="mt-8 flex items-center justify-between border-t border-slate-100 pt-6">
          <button
            type="button"
            onClick={handleBack}
            disabled={step === 1}
            className="rounded-lg px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900 disabled:invisible"
          >
            Back
          </button>
          {step < STEPS.length ? (
            <button
              type="button"
              onClick={handleNext}
              className="rounded-lg bg-slate-900 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800"
            >
              Continue
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="rounded-lg bg-slate-900 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-60"
            >
              {submitting ? "Submitting…" : "Submit & score"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
