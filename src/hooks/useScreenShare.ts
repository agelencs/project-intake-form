"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const SCREEN_SHARE_DURATION_SEC = 20;
export const SCREEN_SHARE_WARN_SEC = 5;

export function useScreenShare() {
  const [sharing, setSharing] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const endShare = useCallback((reason: "manual" | "timeout") => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setSharing(false);
    setSecondsLeft(null);
    setTimedOut(reason === "timeout");
  }, []);

  const stop = useCallback(() => {
    endShare("manual");
  }, [endShare]);

  const start = useCallback(async () => {
    setError(null);
    setTimedOut(false);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getDisplayMedia) {
      setError("Screen sharing is not available in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 5 },
        audio: false,
      });
      stream.getVideoTracks()[0]?.addEventListener("ended", () => endShare("manual"));
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setSecondsLeft(SCREEN_SHARE_DURATION_SEC);
      setSharing(true);
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotAllowedError") return;
      setError("Could not start screen sharing.");
    }
  }, [endShare]);

  useEffect(() => {
    if (!sharing) return;
    const id = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          queueMicrotask(() => endShare("timeout"));
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [sharing, endShare]);

  const captureJpeg = useCallback(async (): Promise<string | null> => {
    const video = videoRef.current;
    if (!video || !sharing || video.videoWidth < 8) return null;
    const maxW = 1280;
    const scale = Math.min(1, maxW / video.videoWidth);
    const width = Math.round(video.videoWidth * scale);
    const height = Math.round(video.videoHeight * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, width, height);
    return new Promise((resolve) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(null);
            return;
          }
          const reader = new FileReader();
          reader.onload = () => {
            const result = String(reader.result ?? "");
            const base64 = result.includes(",") ? result.split(",")[1] : result;
            resolve(base64 || null);
          };
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(blob);
        },
        "image/jpeg",
        0.55,
      );
    });
  }, [sharing]);

  useEffect(() => () => endShare("manual"), [endShare]);

  return {
    sharing,
    secondsLeft,
    timedOut,
    error,
    videoRef,
    start,
    stop,
    captureJpeg,
  };
}
