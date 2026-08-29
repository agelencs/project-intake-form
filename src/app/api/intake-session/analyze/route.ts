import { generateText, Output } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getIntakeModel, hasIntakeModelKey } from "@/lib/intake-model";
import {
  applyUpdates,
  buildQuestionCatalog,
  emptyAnswers,
  emptyStatuses,
  formatStateForPrompt,
  reviewSummary,
  type FieldStatus,
  type FieldUpdate,
} from "@/lib/intake-session";
import type { FormAnswers } from "@/lib/types";

export const maxDuration = 60;

const updateSchema = z.object({
  id: z.string(),
  value: z.union([z.string(), z.array(z.string()), z.number()]).transform(
    (value) => (typeof value === "number" ? String(value) : value),
  ),
  status: z.enum(["unanswered", "partial", "sufficient", "unclear"]),
  note: z.string().optional(),
});

const analyzeSchema = z.object({
  updates: z.array(updateSchema).default([]),
  followUpQuestion: z.string().nullable().default(null),
  keepListening: z.boolean().default(false),
  understood: z.array(z.string()).default([]),
  screenObservation: z.string().optional(),
});

const requestSchema = z.object({
  recentTranscript: z.string().default(""),
  typedMessage: z.string().optional(),
  answers: z.record(z.string(), z.union([z.string(), z.array(z.string())])).default({}),
  statuses: z
    .record(
      z.string(),
      z.enum(["unanswered", "partial", "sufficient", "unclear"]),
    )
    .default({}),
  notes: z.record(z.string(), z.string()).default({}),
  previousQuestions: z.array(z.string()).default([]),
  screenshot: z.string().optional(),
  finalize: z.boolean().default(false),
});

function systemPrompt(): string {
  return `You are filling an EXISTING automation intake form from a live conversation and optional screenshots.

The form below is the only source of truth. Never invent fields, scores, or a new requirements structure.
For single/multi questions you MUST copy an option string exactly — including punctuation and en-dashes.
A single user explanation may fill many fields. Do not re-ask anything already marked sufficient.
If you are not confident which option fits, set status to "unclear", leave a short note, and ask about it.
Do not fill name or email unless the user actually said them. Never invent contact details.

Statuses:
- unanswered: nothing useful yet
- partial: some signal, not enough to score
- sufficient: can be used as a form answer
- unclear: something was said/shown but it does not map cleanly

You are called after a pause in speech, with only the NEW words since the last pause, plus the current form state (that is your memory of everything already understood). Do not expect a full transcript.

After extracting updates: if something important is missing or unclear, set followUpQuestion to ONE natural clarifying question. It will stay on the user's screen. They may keep talking and answer it later — do not wait for them to stop for good. Do not walk the form question-by-question. Do not list field IDs. Prefer work description, process steps, tools, volume, then pain, then identity.
keepListening=true means they can keep talking; you may still return a followUpQuestion if a clarification would help.
Do not repeat a question already listed in previousQuestions unless they ignored it and it is still the most important gap.
If the new words clearly continue a rich explanation and nothing is blocking, followUpQuestion may be null.

If a screenshot is attached, look at it. Combine it with speech (e.g. "this is where we currently do it"). Infer tools, data shape, steps, and outputs from what is visible. Mention what you saw in screenObservation.

When finalize=true: extract last details, do not ask a new question, set followUpQuestion to null, and put remaining doubts in notes / understood.

FORM CATALOG:
${buildQuestionCatalog()}`;
}

function parseJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced?.[1] ?? text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object");
  return JSON.parse(raw.slice(start, end + 1));
}

export async function POST(request: Request) {
  if (!hasIntakeModelKey()) {
    return NextResponse.json(
      {
        error:
          "Missing API key. Set GOOGLE_GENERATIVE_AI_API_KEY (Gemini) or AI_GATEWAY_API_KEY on the server.",
      },
      { status: 503 },
    );
  }

  let body: z.infer<typeof requestSchema>;
  try {
    body = requestSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const answers: FormAnswers = { ...emptyAnswers(), ...body.answers };
  const statuses: Record<string, FieldStatus> = {
    ...emptyStatuses(),
    ...body.statuses,
  };

  const userBits = [
    body.recentTranscript && `New words since last pause:\n${body.recentTranscript}`,
    body.typedMessage && `Typed message (may be answering an on-screen question):\n${body.typedMessage}`,
    `Current form state (your memory of the session):\n${formatStateForPrompt(answers, statuses, body.notes)}`,
    body.previousQuestions.length
      ? `Questions already on their screen:\n${body.previousQuestions.map((q) => `- ${q}`).join("\n")}`
      : "",
    body.finalize
      ? "This is the end of the session. Extract remaining answers. Do not ask a follow-up."
      : "The user paused. Extract new answers. If something important needs clarifying, return one follow-up question for the screen — they can answer it whenever they get to it.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const content: Array<
    | { type: "text"; text: string }
    | { type: "file"; data: string; mediaType: "image/jpeg" }
  > = [{ type: "text", text: userBits }];

  if (body.screenshot) {
    content.push({
      type: "file",
      data: body.screenshot,
      mediaType: "image/jpeg",
    });
  }

  const model = getIntakeModel();
  let parsed: z.infer<typeof analyzeSchema>;

  try {
    const result = await generateText({
      model,
      system: systemPrompt(),
      messages: [{ role: "user", content }],
      output: Output.object({ schema: analyzeSchema }),
      temperature: 0.3,
      maxOutputTokens: 4096,
      providerOptions: {
        google: {
          thinkingConfig: { thinkingLevel: "minimal" },
        },
      },
    });
    if (!result.output) throw new Error("No structured output");
    parsed = result.output;
  } catch {
    try {
      const fallback = await generateText({
        model,
        system: `${systemPrompt()}\n\nRespond with a single JSON object matching { updates, followUpQuestion, keepListening, understood, screenObservation }. No markdown.`,
        messages: [{ role: "user", content }],
        temperature: 0.3,
        maxOutputTokens: 4096,
      });
      parsed = analyzeSchema.parse(parseJsonObject(fallback.text));
    } catch (error) {
      console.error("Intake analyze failed", error);
      return NextResponse.json(
        { error: "The AI could not analyse that turn. Try speaking or typing a bit more." },
        { status: 502 },
      );
    }
  }

  const updates: FieldUpdate[] = parsed.updates.map((u) => ({
    id: u.id,
    value: u.value,
    status: u.status,
    note: u.note,
  }));

  const merged = applyUpdates(answers, statuses, body.notes, updates);
  const summary = reviewSummary(merged.answers, merged.statuses, merged.notes);

  const followUp = body.finalize
    ? null
    : parsed.followUpQuestion?.trim() || null;

  return NextResponse.json({
    answers: merged.answers,
    statuses: merged.statuses,
    notes: merged.notes,
    followUpQuestion: followUp,
    keepListening: body.finalize ? false : parsed.keepListening,
    understood: parsed.understood.slice(0, 8),
    screenObservation: parsed.screenObservation?.trim() || null,
    filledCount: summary.filledCount,
    visibleCount: summary.visibleCount,
  });
}
