"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useScreenShare } from "@/hooks/useScreenShare";
import { useSpeechTranscript } from "@/hooks/useSpeechTranscript";
import {
  REVIEW_STORAGE_KEY,
  emptyAnswers,
  emptyStatuses,
  type FieldStatus,
} from "@/lib/intake-session";
import type { FormAnswers } from "@/lib/types";

const OPENER =
  "Tell me about the work you would like to automate. Walk me through it as if I were a new colleague — what it is, how it happens today, and what is painful. You can share your screen if pointing at it is easier than describing it.";

type TranscriptLine =
  | { id: string; kind: "user"; text: string }
  | { id: string; kind: "note"; text: string }
  | { id: string; kind: "screen"; text: string };

type AnalyzeResponse = {
  answers: FormAnswers;
  statuses: Record<string, FieldStatus>;
  notes: Record<string, string>;
  followUpQuestion: string | null;
  keepListening: boolean;
  understood: string[];
  screenObservation: string | null;
  filledCount: number;
  visibleCount: number;
  error?: string;
};

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
    listening,
    interim,
    error: speechError,
    start: startMic,
    stop: stopMic,
    setOnFinal,
    appendTyped,
  } = useSpeechTranscript();

  const [questions, setQuestions] = useState<string[]>([OPENER]);
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const [typed, setTyped] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coverage, setCoverage] = useState({ filled: 0, visible: 48 });

  const answersRef = useRef<FormAnswers>(emptyAnswers());
  const statusesRef = useRef<Record<string, FieldStatus>>(emptyStatuses());
  const notesRef = useRef<Record<string, string>>({});
  const questionsRef = useRef<string[]>([OPENER]);
  const transcriptRef = useRef("");
  const analyzedThroughRef = useRef("");
  const analyzingRef = useRef(false);
  const pendingRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const sharingRef = useRef(sharing);
  const captureJpegRef = useRef(captureJpeg);
  const runAnalyzeRef = useRef<
    (opts: {
      recent: string;
      typedMessage?: string;
      finalize?: boolean;
      forceScreenshot?: boolean;
    }) => Promise<AnalyzeResponse | null>
  >(async () => null);

  useEffect(() => {
    questionsRef.current = questions;
  }, [questions]);

  useEffect(() => {
    sharingRef.current = sharing;
  }, [sharing]);

  useEffect(() => {
    captureJpegRef.current = captureJpeg;
  }, [captureJpeg]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines, interim]);

  useEffect(() => {
    runAnalyzeRef.current = async (opts) => {
      if (analyzingRef.current) {
        pendingRef.current = true;
        return null;
      }
      analyzingRef.current = true;
      setAnalyzing(true);
      setError(null);

      let screenshot: string | undefined;
      if (sharingRef.current || opts.forceScreenshot) {
        screenshot = (await captureJpegRef.current()) ?? undefined;
      }

      try {
        const res = await fetch("/api/intake-session/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recentTranscript: opts.recent,
            typedMessage: opts.typedMessage,
            answers: answersRef.current,
            statuses: statusesRef.current,
            notes: notesRef.current,
            previousQuestions: questionsRef.current,
            screenshot,
            finalize: Boolean(opts.finalize),
          }),
        });
        const data = (await res.json()) as AnalyzeResponse;
        if (!res.ok) {
          setError(data.error ?? "Could not analyse that just now.");
          return null;
        }

        answersRef.current = data.answers;
        statusesRef.current = data.statuses;
        notesRef.current = data.notes;
        analyzedThroughRef.current = transcriptRef.current;
        setCoverage({ filled: data.filledCount, visible: data.visibleCount });

        if (data.understood?.length) {
          setLines((prev) => [
            ...prev,
            ...data.understood.map((text) => ({
              id: newId(),
              kind: "note" as const,
              text,
            })),
          ]);
        }
        if (data.screenObservation) {
          setLines((prev) => [
            ...prev,
            { id: newId(), kind: "screen", text: data.screenObservation as string },
          ]);
        }
        if (data.followUpQuestion) {
          setQuestions((prev) =>
            prev[prev.length - 1] === data.followUpQuestion
              ? prev
              : [...prev, data.followUpQuestion as string],
          );
        }
        return data;
      } catch {
        setError("Network error while analysing. Check your connection and try again.");
        return null;
      } finally {
        analyzingRef.current = false;
        setAnalyzing(false);
        if (pendingRef.current) {
          pendingRef.current = false;
          const recent = transcriptRef.current
            .slice(analyzedThroughRef.current.length)
            .trim();
          if (recent.length >= 8) {
            void runAnalyzeRef.current({ recent });
          }
        }
      }
    };
  }, []);

  const scheduleAnalyze = useCallback((recent: string, full: string) => {
    transcriptRef.current = full;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const delta = full.slice(analyzedThroughRef.current.length).trim();
      const chunk = delta || recent.trim();
      if (chunk.length < 12) return;
      setLines((prev) => [...prev, { id: newId(), kind: "user", text: chunk }]);
      void runAnalyzeRef.current({ recent: chunk });
    }, 1800);
  }, []);

  useEffect(() => {
    setOnFinal(scheduleAnalyze);
  }, [scheduleAnalyze, setOnFinal]);

  useEffect(() => {
    if (!sharing) return;
    const timer = setTimeout(() => {
      if (!transcriptRef.current.trim()) {
        void runAnalyzeRef.current({
          recent: "(User started sharing their screen and has not spoken yet.)",
          forceScreenshot: true,
        });
      }
    }, 4500);
    return () => clearTimeout(timer);
  }, [sharing]);

  async function handleTypedSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = typed.trim();
    if (!text) return;
    setTyped("");
    const next = transcriptRef.current
      ? `${transcriptRef.current}\n${text}`
      : text;
    transcriptRef.current = next;
    appendTyped(text);
    setLines((prev) => [...prev, { id: newId(), kind: "user", text }]);
    if (analyzingRef.current) {
      pendingRef.current = true;
      return;
    }
    await runAnalyzeRef.current({ recent: text, typedMessage: text });
  }

  async function handleFinish() {
    setFinishing(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const leftover = transcriptRef.current
      .slice(analyzedThroughRef.current.length)
      .trim();
    if (leftover || Object.keys(notesRef.current).length >= 0) {
      await runAnalyzeRef.current({ recent: leftover, finalize: true });
    }
    stopMic();
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

  return (
    <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(20rem,0.9fr)]">
      <section className="flex min-h-[70vh] flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => (listening ? stopMic() : startMic())}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              listening
                ? "bg-rose-600 text-white hover:bg-rose-500"
                : "bg-slate-900 text-white hover:bg-slate-800"
            }`}
          >
            {listening ? "Listening… tap to pause" : "Start microphone"}
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
            {analyzing ? "Updating from the last pause…" : "Keep talking — questions stay on screen"}
          </span>
        </div>

        <div className="flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            On the table
          </p>
          <h2 className="mt-2 text-2xl font-semibold leading-snug text-slate-900">
            {currentQuestion}
          </h2>
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

        {(error || speechError || screenError) && (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error || speechError || screenError}
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
            What we heard, plus short notes of what the AI understood.
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
          {lines.length === 0 && !interim && (
            <p className="text-slate-400">Waiting for you to start talking…</p>
          )}
          {lines.map((line) => (
            <p
              key={line.id}
              className={
                line.kind === "user"
                  ? "text-slate-800"
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
              {line.text}
            </p>
          ))}
          {interim && (
            <p className="italic text-slate-400">{interim}</p>
          )}
          <div ref={transcriptEndRef} />
        </div>
        <div className="border-t border-slate-100 px-5 py-3 text-xs text-slate-400">
          {coverage.filled} fields have enough to review
          {analyzing ? " · analysing…" : ""}
        </div>
      </aside>
    </div>
  );
}
