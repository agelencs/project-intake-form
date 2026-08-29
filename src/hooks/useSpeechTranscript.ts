"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
};

type SpeechRecognitionResultEvent = {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
};

function getRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useSpeechTranscript() {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const shouldListenRef = useRef(false);
  const onFinalRef = useRef<((text: string, full: string) => void) | null>(null);

  const setOnFinal = useCallback((handler: (text: string, full: string) => void) => {
    onFinalRef.current = handler;
  }, []);

  const stop = useCallback(() => {
    shouldListenRef.current = false;
    setListening(false);
    setInterim("");
    try {
      recognitionRef.current?.abort();
    } catch {
      /* ignore */
    }
  }, []);

  const start = useCallback(() => {
    const Ctor = getRecognitionConstructor();
    if (!Ctor) {
      setError("Live speech is not supported in this browser. Type instead, or use Chrome/Edge.");
      return;
    }

    shouldListenRef.current = true;
    setError(null);
    try {
      recognitionRef.current?.abort();
    } catch {
      /* ignore */
    }

    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-GB";
    recognitionRef.current = recognition;

    recognition.onresult = (event) => {
      let interimText = "";
      const finals: string[] = [];
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const piece = event.results[i][0].transcript;
        if (event.results[i].isFinal) finals.push(piece);
        else interimText += piece;
      }
      setInterim(interimText);
      if (finals.length === 0) return;
      const chunk = finals.join(" ").trim();
      if (!chunk) return;
      setTranscript((prev) => {
        const next = prev ? `${prev} ${chunk}` : chunk;
        onFinalRef.current?.(chunk, next);
        return next;
      });
    };

    recognition.onerror = (event) => {
      if (event.error === "not-allowed") {
        setError("Microphone permission was blocked. You can still type.");
        shouldListenRef.current = false;
        setListening(false);
        return;
      }
      if (event.error === "no-speech" || event.error === "aborted") return;
      setError(`Microphone error: ${event.error}`);
    };

    recognition.onend = () => {
      if (!shouldListenRef.current) {
        setListening(false);
        return;
      }
      try {
        recognition.start();
        setListening(true);
      } catch {
        setListening(false);
      }
    };

    try {
      recognition.start();
      setListening(true);
    } catch {
      setError("Could not start the microphone.");
      setListening(false);
    }
  }, []);

  const appendTyped = useCallback((text: string) => {
    setTranscript((prev) => (prev ? `${prev}\n${text}` : text));
  }, []);

  useEffect(() => () => stop(), [stop]);

  return {
    listening,
    transcript,
    interim,
    error,
    start,
    stop,
    setOnFinal,
    appendTyped,
  };
}
