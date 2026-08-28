"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import {
  formatAnswerValue,
  QUESTIONS,
  STEPS,
} from "@/lib/questions";
import {
  BucketBadge,
  ConfidenceBadge,
  ScoreBar,
} from "@/components/ScoreDisplay";
import type { Submission } from "@/lib/types";

export default function SubmissionDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    fetch(`/api/submissions/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then(setSubmission)
      .catch(() => setSubmission(null))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/submissions/${id}`, { method: "DELETE" });
      if (res.ok) router.push("/dashboard");
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-16 text-center text-sm text-slate-500">
        Loading…
      </div>
    );
  }

  if (!submission) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-16 text-center">
        <p className="text-lg font-medium text-slate-900">Submission not found</p>
        <Link
          href="/dashboard"
          className="mt-4 inline-block text-sm text-slate-600 hover:text-slate-900"
        >
          Back to dashboard
        </Link>
      </div>
    );
  }

  const { score, answers } = submission;

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-6">
        <Link
          href="/dashboard"
          className="text-sm text-slate-500 transition-colors hover:text-slate-900"
        >
          ← Back to dashboard
        </Link>
      </div>

      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            {(answers.Q6 as string) || "Untitled opportunity"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {answers.Q1 as string} · {answers.Q5 as string} ·{" "}
            {new Date(submission.createdAt).toLocaleString()}
          </p>
        </div>
        <div className="flex gap-2">
          {!showConfirm ? (
            <button
              type="button"
              onClick={() => setShowConfirm(true)}
              className="rounded-lg border border-rose-200 px-4 py-2 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50"
            >
              Delete
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-600">Delete this?</span>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-60"
              >
                {deleting ? "Deleting…" : "Confirm"}
              </button>
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="mb-8 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <BucketBadge bucket={score.bucket} label={score.bucketLabel} />
          <ConfidenceBadge confidence={score.confidence} />
        </div>

        <div className="mb-8 grid gap-5 sm:grid-cols-3">
          <ScoreBar label="Impact" value={score.impactScore} />
          <ScoreBar label="Feasibility" value={score.feasibilityScore} />
          <ScoreBar label="Risk" value={score.riskScore} tone="risk" />
        </div>

        <div className="mb-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl bg-slate-50 p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Estimated volume
            </p>
            <p className="mt-1 text-3xl font-semibold tabular-nums text-slate-900">
              {score.hoursPerYear.toLocaleString()}
            </p>
            <p className="text-sm text-slate-500">
              hours per year (~{score.hoursPerWeek} hrs/week)
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Recommended scope
            </p>
            <p className="mt-2 text-sm leading-relaxed text-slate-700">
              {score.recommendedScope}
            </p>
          </div>
        </div>

        {score.feedback.length > 0 && (
          <div className="mb-6">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Feedback</h2>
            <div className="space-y-2">
              {score.feedback.map((line, i) => (
                <p
                  key={i}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-700"
                >
                  {line}
                </p>
              ))}
            </div>
          </div>
        )}

        {score.flags.length > 0 && (
          <div className="mb-6">
            <h2 className="mb-2 text-sm font-semibold text-slate-900">Flags</h2>
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

        <div className="grid gap-6 sm:grid-cols-2">
          <ReasonList title="Impact drivers" items={score.reasons.impact} />
          <ReasonList title="Feasibility drivers" items={score.reasons.feasibility} />
          <ReasonList title="Risk factors" items={score.reasons.risk} />
          <ReasonList title="Confidence" items={score.reasons.confidence} />
        </div>
      </div>

      <h2 className="mb-4 text-lg font-semibold text-slate-900">
        Full responses
      </h2>
      <div className="space-y-4">
        {STEPS.map((step) => {
          const stepQuestions = QUESTIONS.filter((q) => q.step === step.id);
          const hasAnswers = stepQuestions.some((q) => {
            const v = answers[q.id];
            if (Array.isArray(v)) return v.filter(Boolean).length > 0;
            return v && String(v).trim();
          });
          if (!hasAnswers) return null;

          return (
            <div
              key={step.id}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <h3 className="mb-4 text-sm font-semibold text-slate-900">
                Step {step.id}: {step.name}
              </h3>
              <dl className="space-y-4">
                {stepQuestions.map((q) => {
                  const val = answers[q.id];
                  const formatted = formatAnswerValue(q.id, val);
                  if (formatted === "—") return null;
                  return (
                    <div key={q.id}>
                      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        {q.title}
                      </dt>
                      <dd className="mt-1 text-sm text-slate-800">
                        {q.id === "Q20" && Array.isArray(val) ? (
                          <ol className="list-decimal space-y-1 pl-4">
                            {val.filter(Boolean).map((step, i) => (
                              <li key={i}>{step}</li>
                            ))}
                          </ol>
                        ) : (
                          formatted
                        )}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ReasonList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </h3>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item} className="text-sm text-slate-700">
            · {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
