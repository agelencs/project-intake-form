"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useGeminiLive } from "@/hooks/useGeminiLive";
import { useScreenShare } from "@/hooks/useScreenShare";
import type { LiveToolParse } from "@/lib/intake-live";
import { liveSystemInstruction, OPENER } from "@/lib/intake-prompts";
import {
  REVIEW_STORAGE_KEY,
  applyUpdates,
  emptyAnswers,
  emptyStatuses,
  formatStateForPrompt,
  reviewSummary,
  type FieldStatus,
} from "@/lib/intake-session";
import type { FormAnswers } from "@/lib/types";

type TranscriptLine =
  | { id: string; kind: "user"; text: string }
  | { id: string; kind: "ai"; text: string }
  | { id: string; kind: "note"; text: string }
  | { id: string; kind: "screen"; text: string };

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function pushQuestion(prev: string[], next: string) {
  const trimmed = next.trim();
  if (!trimmed) return prev;
  if (prev[prev.length - 1] === trimmed) return prev;
  return [...prev, trimmed];
}

export function ExplainSession() {
  const router = useRouter();
  const {
    sharing,
    error: screenError,
    videoRef,
    start: startShare,
    stop: stopShare,
    captureJpeg,
  } = useScreenShare();
  const {
    status: liveStatus,
    listening: liveMicOn,
    connect: connectLive,
    disconnect: disconnectLive,
    startListening: startLiveMic,
    stopListening: stopLiveMic,
    sendText: sendLiveText,
    sendJpegFrame,
  } = useGeminiLive();

  const [questions, setQuestions] = useState<string[]>([OPENER]);
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const [typed, setTyped] = useState("");
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coverage, setCoverage] = useState({ filled: 0, visible: 48 });
  const [liveInterimUser, setLiveInterimUser] = useState("");
  const [liveInterimAi, setLiveInterimAi] = useState("");

  const answersRef = useRef<FormAnswers>(emptyAnswers());
  const statusesRef = useRef<Record<string, FieldStatus>>(emptyStatuses());
  const notesRef = useRef<Record<string, string>>({});
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const captureJpegRef = useRef(captureJpeg);
  const lastLiveUserRef = useRef("");
  const lastLiveAiRef = useRef("");

  useEffect(() => {
    captureJpegRef.current = captureJpeg;
  }, [captureJpeg]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines, liveInterimUser, liveInterimAi]);

  const applyLiveTool = useCallback((parsed: LiveToolParse) => {
    const merged = applyUpdates(
      answersRef.current,
      statusesRef.current,
      notesRef.current,
      parsed.updates,
    );
    answersRef.current = merged.answers;
    statusesRef.current = merged.statuses;
    notesRef.current = merged.notes;
    const summary = reviewSummary(merged.answers, merged.statuses, merged.notes);
    setCoverage({ filled: summary.filledCount, visible: summary.visibleCount });

    if (parsed.understood.length) {
      setLines((prev) => [
        ...prev,
        ...parsed.understood.map((text) => ({
          id: newId(),
          kind: "note" as const,
          text,
        })),
      ]);
    }
    if (parsed.screenObservation) {
      setLines((prev) => [
        ...prev,
        { id: newId(), kind: "screen", text: parsed.screenObservation as string },
      ]);
    }
    if (parsed.followUpQuestion) {
      setQuestions((prev) => pushQuestion(prev, parsed.followUpQuestion as string));
    }

    return {
      filledCount: summary.filledCount,
      visibleCount: summary.visibleCount,
      remainingRequired: summary.missing.map((q) => `${q.id}: ${q.title}`),
      remainingUnclear: summary.unclear.map((q) => `${q.id}: ${q.title}`),
    };
  }, []);

  useEffect(() => {
    if (liveStatus !== "live" || !sharing) return;
    const timer = setInterval(async () => {
      const jpeg = await captureJpegRef.current();
      if (jpeg) sendJpegFrame(jpeg);
    }, 2000);
    return () => clearInterval(timer);
  }, [liveStatus, sendJpegFrame, sharing]);

  async function handleLiveMic() {
    if (liveStatus === "connecting") return;
    if (liveStatus === "live" && liveMicOn) {
      stopLiveMic();
      return;
    }
    if (liveStatus === "live") {
      await startLiveMic();
      return;
    }

    setError(null);
    const ok = await connectLive({
      systemInstruction: liveSystemInstruction(
        formatStateForPrompt(answersRef.current, statusesRef.current, notesRef.current),
      ),
      onUserTranscript: (text, final) => {
        if (!final) {
          setLiveInterimUser(text);
          return;
        }
        setLiveInterimUser("");
        if (!text || text === lastLiveUserRef.current) return;
        lastLiveUserRef.current = text;
        setLines((prev) => [...prev, { id: newId(), kind: "user", text }]);
      },
      onAssistantTranscript: (text, final) => {
        if (!final) {
          setLiveInterimAi(text);
          return;
        }
        setLiveInterimAi("");
        if (!text || text === lastLiveAiRef.current) return;
        lastLiveAiRef.current = text;
        setLines((prev) => [...prev, { id: newId(), kind: "ai", text }]);
        if (text.includes("?")) {
          setQuestions((prev) => pushQuestion(prev, text));
        }
      },
      onTool: applyLiveTool,
      onError: (message) => setError(message),
    });
    if (ok) await startLiveMic();
  }

  async function handleTypedSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = typed.trim();
    if (!text) return;
    setTyped("");
    setLines((prev) => [...prev, { id: newId(), kind: "user", text }]);

    if (liveStatus !== "live") {
      setError("Start the conversation first, then type if you want.");
      return;
    }
    sendLiveText(text);
  }

  async function handleFinish() {
    setFinishing(true);
    disconnectLive();
    stopShare();
    const payload = {
      answers: answersRef.current,
      statuses: statusesRef.current,
      notes: notesRef.current,
      understood: lines.filter((l) => l.kind === "note").map((l) => l.text),
    };
    sessionStorage.setItem(REVIEW_STORAGE_KEY, JSON.stringify(payload));
    router.push("/?review=1");
  }

  const currentQuestion = questions[questions.length - 1] ?? OPENER;
  const micBusy = liveStatus === "connecting";

  let micLabel = "Start conversation";
  if (liveStatus === "connecting") {
    micLabel = "Connecting…";
  } else if (liveMicOn) {
    micLabel = "Listening… tap to pause";
  } else if (liveStatus === "live") {
    micLabel = "Resume microphone";
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(20rem,0.9fr)]">
      <section className="flex min-h-[70vh] flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={micBusy}
            onClick={() => void handleLiveMic()}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:opacity-60 ${
              liveMicOn
                ? "bg-rose-600 text-white hover:bg-rose-500"
                : "bg-slate-900 text-white hover:bg-slate-800"
            }`}
          >
            {micLabel}
          </button>
          <button
            type="button"
            onClick={() => (sharing ? stopShare() : startShare())}
            className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              sharing
                ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                : "border-slate-200 text-slate-700 hover:bg-slate-50"
            }`}
          >
            {sharing ? "Stop sharing screen" : "Share screen"}
          </button>
          <span className="ml-auto text-xs text-slate-400">
            {liveStatus === "live"
              ? "Speak naturally — the agent will ask the next question"
              : "Use headphones for the best experience"}
          </span>
        </div>

        <div className="flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            On the table
          </p>
          <h2 className="mt-2 text-2xl font-semibold leading-snug text-slate-900">
            {currentQuestion}
          </h2>
          {liveInterimAi && (
            <p className="mt-2 text-sm italic text-slate-400">{liveInterimAi}</p>
          )}
          <p className="mt-2 text-sm text-slate-500">
            Answer whenever you get to it — you can keep explaining in the meantime.
          </p>
          {questions.length > 1 && (
            <ol className="mt-6 space-y-3 border-t border-slate-100 pt-5">
              {questions.slice(0, -1).map((q, i) => (
                <li key={`${i}-${q.slice(0, 24)}`} className="text-sm text-slate-500">
                  <span className="mr-2 font-medium text-slate-400">{i + 1}.</span>
                  {q}
                </li>
              ))}
            </ol>
          )}
        </div>

        {(error || screenError) && (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error || screenError}
          </div>
        )}

        <form onSubmit={handleTypedSubmit} className="mt-6 flex gap-2">
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Speak or type — answer the question above whenever you get to it"
            className="flex-1 rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
          />
          <button
            type="submit"
            disabled={!typed.trim()}
            className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            Send
          </button>
        </form>

        <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-5">
          <button
            type="button"
            onClick={() => router.push("/")}
            className="text-sm font-medium text-slate-500 hover:text-slate-800"
          >
            Back to form
          </button>
          <button
            type="button"
            onClick={() => void handleFinish()}
            disabled={finishing}
            className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {finishing ? "Preparing form…" : "Finish and review form"}
          </button>
        </div>
      </section>

      <aside className="flex min-h-[70vh] flex-col rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h3 className="text-sm font-semibold text-slate-900">Live transcript</h3>
          <p className="mt-1 text-xs text-slate-500">
            What you both said, plus short notes of what was written onto the form.
          </p>
        </div>
        {sharing && (
          <p className="border-b border-slate-100 bg-slate-50 px-5 pt-3 text-xs font-medium text-slate-500">
            Shared screen
          </p>
        )}
        <video
          ref={videoRef}
          muted
          playsInline
          autoPlay
          aria-hidden
          className={
            sharing
              ? "aspect-video w-full border-b border-slate-100 bg-slate-900 object-contain"
              : "pointer-events-none fixed top-0 left-0 h-px w-px opacity-0"
          }
        />
        {sharing && (
          <p className="border-b border-slate-100 bg-slate-50 px-5 pb-3 text-[11px] leading-relaxed text-slate-400">
            Screenshots are sent to Gemini to help fill the form. They are not stored.
          </p>
        )}
        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4 text-sm">
          {lines.length === 0 && !liveInterimUser && !liveInterimAi && (
            <p className="text-slate-400">Waiting for you to start talking…</p>
          )}
          {lines.map((line) => (
            <p
              key={line.id}
              className={
                line.kind === "user"
                  ? "text-slate-800"
                  : line.kind === "ai"
                    ? "rounded-lg bg-violet-50 px-3 py-2 text-violet-900"
                    : line.kind === "screen"
                      ? "rounded-lg bg-indigo-50 px-3 py-2 text-indigo-800"
                      : "rounded-lg bg-slate-50 px-3 py-2 text-slate-600"
              }
            >
              {line.kind === "note" && (
                <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Understood
                </span>
              )}
              {line.kind === "screen" && (
                <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-indigo-500">
                  Screen
                </span>
              )}
              {line.kind === "ai" && (
                <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-violet-500">
                  Agent
                </span>
              )}
              {line.text}
            </p>
          ))}
          {liveInterimUser && (
            <p className="italic text-slate-400">{liveInterimUser}</p>
          )}
          <div ref={transcriptEndRef} />
        </div>
        <div className="border-t border-slate-100 px-5 py-3 text-xs text-slate-400">
          {coverage.filled} fields have enough to review
          {liveStatus === "live" ? " · live" : ""}
        </div>
      </aside>
    </div>
  );
}
