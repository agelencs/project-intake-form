import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { calculateScore } from "@/lib/scoring";
import { addSubmission, readSubmissions } from "@/lib/storage";
import type { FormAnswers } from "@/lib/types";

export async function GET() {
  const submissions = await readSubmissions();
  const summary = submissions.map((s) => ({
    id: s.id,
    createdAt: s.createdAt,
    name: s.answers.Q6 as string,
    department: s.answers.Q5 as string,
    submitter: s.answers.Q1 as string,
    bucket: s.score.bucket,
    bucketLabel: s.score.bucketLabel,
    impactScore: s.score.impactScore,
    feasibilityScore: s.score.feasibilityScore,
    riskScore: s.score.riskScore,
    hoursPerYear: s.score.hoursPerYear,
  }));
  return NextResponse.json(summary);
}

export async function POST(request: Request) {
  try {
    const answers = (await request.json()) as FormAnswers;
    const score = calculateScore(answers);
    const submission = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      answers,
      score,
    };
    await addSubmission(submission);
    return NextResponse.json(submission, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to save submission" }, { status: 500 });
  }
}
