"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BucketBadge } from "@/components/ScoreDisplay";
import type { Bucket } from "@/lib/types";

type Summary = {
  id: string;
  createdAt: string;
  name: string;
  department: string;
  submitter: string;
  bucket: Bucket;
  bucketLabel: string;
  impactScore: number;
  feasibilityScore: number;
  riskScore: number;
  hoursPerYear: number;
};

export default function DashboardPage() {
  const [submissions, setSubmissions] = useState<Summary[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Bucket | "all">("all");

  useEffect(() => {
    fetch("/api/submissions")
      .then((r) => r.json())
      .then((data) => setSubmissions(data))
      .finally(() => setLoading(false));
  }, []);

  const filtered =
    filter === "all"
      ? submissions
      : submissions.filter((s) => s.bucket === filter);

  const sorted = [...filtered].sort((a, b) => {
    const priority: Record<Bucket, number> = {
      "do-first": 0,
      investigate: 1,
      "easy-win": 2,
      park: 3,
    };
    const p = priority[a.bucket] - priority[b.bucket];
    if (p !== 0) return p;
    return b.impactScore - a.impactScore;
  });

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Backlog</h1>
          <p className="mt-1 text-sm text-slate-500">
            All submitted automation opportunities, ranked by priority.
          </p>
        </div>
        <Link
          href="/"
          className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800"
        >
          New submission
        </Link>
      </div>

      {!loading && submissions.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {(
            [
              ["all", "All"],
              ["do-first", "Do first"],
              ["investigate", "Investigate"],
              ["easy-win", "Easy win"],
              ["park", "Park"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === key
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50"
              }`}
            >
              {label}
              {key !== "all" && (
                <span className="ml-1 opacity-70">
                  ({submissions.filter((s) => s.bucket === key).length})
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">
          Loading submissions…
        </div>
      ) : sorted.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-16 text-center">
          <p className="text-lg font-medium text-slate-900">No submissions yet</p>
          <p className="mt-2 text-sm text-slate-500">
            Submit your first automation opportunity to see it here.
          </p>
          <Link
            href="/"
            className="mt-6 inline-block rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800"
          >
            Start intake form
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/80">
                <th className="px-6 py-3.5 font-medium text-slate-600">Opportunity</th>
                <th className="hidden px-4 py-3.5 font-medium text-slate-600 md:table-cell">
                  Department
                </th>
                <th className="px-4 py-3.5 font-medium text-slate-600">Priority</th>
                <th className="hidden px-4 py-3.5 font-medium text-slate-600 sm:table-cell">
                  Impact
                </th>
                <th className="hidden px-4 py-3.5 font-medium text-slate-600 sm:table-cell">
                  Feasibility
                </th>
                <th className="hidden px-4 py-3.5 font-medium text-slate-600 lg:table-cell">
                  Volume
                </th>
                <th className="px-4 py-3.5 font-medium text-slate-600">Submitted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sorted.map((s) => (
                <tr
                  key={s.id}
                  className="group transition-colors hover:bg-slate-50/80"
                >
                  <td className="px-6 py-4">
                    <Link
                      href={`/dashboard/${s.id}`}
                      className="block font-medium text-slate-900 group-hover:text-slate-700"
                    >
                      {s.name || "Untitled"}
                    </Link>
                    <p className="text-xs text-slate-500">{s.submitter}</p>
                  </td>
                  <td className="hidden px-4 py-4 text-slate-600 md:table-cell">
                    {s.department}
                  </td>
                  <td className="px-4 py-4">
                    <BucketBadge bucket={s.bucket} label={s.bucketLabel} />
                  </td>
                  <td className="hidden px-4 py-4 tabular-nums text-slate-600 sm:table-cell">
                    {s.impactScore}
                  </td>
                  <td className="hidden px-4 py-4 tabular-nums text-slate-600 sm:table-cell">
                    {s.feasibilityScore}
                  </td>
                  <td className="hidden px-4 py-4 tabular-nums text-slate-600 lg:table-cell">
                    {s.hoursPerYear.toLocaleString()} hrs/yr
                  </td>
                  <td className="px-4 py-4 text-slate-500">
                    {new Date(s.createdAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
