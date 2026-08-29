"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function useScreenShare() {
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setSharing(false);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getDisplayMedia) {
      setError("Screen sharing is not available in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 5 },
        audio: false,
      });
      stream.getVideoTracks()[0]?.addEventListener("ended", () => stop());
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setSharing(true);
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotAllowedError") return;
      setError("Could not start screen sharing.");
    }
  }, [stop]);

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

  useEffect(() => () => stop(), [stop]);

  return { sharing, error, videoRef, start, stop, captureJpeg };
}
