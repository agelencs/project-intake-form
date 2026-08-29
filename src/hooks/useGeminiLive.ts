"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  LIVE_MODEL,
  LIVE_TOOL_NAME,
  parseLiveToolArgs,
  type LiveToolParse,
} from "@/lib/intake-live";
import { PcmPlayer, startMicCapture } from "@/lib/live-audio";
import type { Session } from "@google/genai";

export type LiveStatus = "idle" | "connecting" | "live";

export type LiveToolResult = {
  filledCount: number;
  visibleCount: number;
  remainingRequired: string[];
  remainingUnclear: string[];
};

type ConnectArgs = {
  systemInstruction: string;
  onUserTranscript: (text: string, final: boolean) => void;
  onAssistantTranscript: (text: string, final: boolean) => void;
  onTool: (parsed: LiveToolParse) => LiveToolResult;
  onError: (message: string) => void;
};

export function useGeminiLive() {
  const [status, setStatus] = useState<LiveStatus>("idle");
  const [listening, setListening] = useState(false);

  const sessionRef = useRef<Session | null>(null);
  const playerRef = useRef<PcmPlayer | null>(null);
  const stopCaptureRef = useRef<(() => void) | null>(null);
  const connectArgsRef = useRef<ConnectArgs | null>(null);
  const inputBufRef = useRef("");
  const outputBufRef = useRef("");
  const ignoreCloseRef = useRef(false);
  const listeningRef = useRef(false);

  const teardownCapture = useCallback(() => {
    stopCaptureRef.current?.();
    stopCaptureRef.current = null;
    listeningRef.current = false;
    setListening(false);
  }, []);

  const disconnect = useCallback(() => {
    ignoreCloseRef.current = true;
    teardownCapture();
    playerRef.current?.close();
    playerRef.current = null;
    try {
      sessionRef.current?.close();
    } catch {
      /* ignore */
    }
    sessionRef.current = null;
    connectArgsRef.current = null;
    inputBufRef.current = "";
    outputBufRef.current = "";
    setStatus("idle");
  }, [teardownCapture]);

  const handleToolCall = useCallback(
    (calls: Array<{ id?: string; name?: string; args?: Record<string, unknown> }>) => {
      const session = sessionRef.current;
      const args = connectArgsRef.current;
      if (!session || !args) return;

      const responses = calls.map((call) => {
        const name = call.name ?? LIVE_TOOL_NAME;
        if (name !== LIVE_TOOL_NAME) {
          return {
            id: call.id,
            name,
            response: { error: `Unknown tool ${name}` },
          };
        }
        const parsed = parseLiveToolArgs(call.args);
        const result = args.onTool(parsed);
        return {
          id: call.id,
          name,
          response: {
            output: {
              applied: parsed.updates.map((u) => u.id),
              filledCount: result.filledCount,
              visibleCount: result.visibleCount,
              remainingRequired: result.remainingRequired,
              remainingUnclear: result.remainingUnclear,
            },
          },
        };
      });

      session.sendToolResponse({ functionResponses: responses });
    },
    [],
  );

  const connect = useCallback(
    async (opts: ConnectArgs): Promise<boolean> => {
      disconnect();
      connectArgsRef.current = opts;
      setStatus("connecting");

      try {
        const tokenRes = await fetch("/api/intake-session/live-token", {
          method: "POST",
        });
        const tokenBody = (await tokenRes.json()) as {
          token?: string;
          model?: string;
          error?: string;
        };
        if (!tokenRes.ok || !tokenBody.token) {
          throw new Error(tokenBody.error ?? "Could not start Gemini Live.");
        }

        ignoreCloseRef.current = false;

        const { GoogleGenAI, Modality, MediaResolution, Type, ThinkingLevel } =
          await import("@google/genai");

        const player = new PcmPlayer();
        await player.ensure();
        playerRef.current = player;

        const ai = new GoogleGenAI({
          apiKey: tokenBody.token,
          apiVersion: "v1alpha",
          httpOptions: { apiVersion: "v1alpha" },
        });

        const session = await ai.live.connect({
          model: tokenBody.model ?? LIVE_MODEL,
          config: {
            responseModalities: [Modality.AUDIO],
            systemInstruction: { parts: [{ text: opts.systemInstruction }] },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            mediaResolution: MediaResolution.MEDIA_RESOLUTION_LOW,
            contextWindowCompression: {
              triggerTokens: "25600",
              slidingWindow: { targetTokens: "12800" },
            },
            tools: [
              {
                functionDeclarations: [
                  {
                    name: LIVE_TOOL_NAME,
                    description:
                      "Write understood answers onto the existing intake form. Call after each useful reply.",
                    parameters: {
                      type: Type.OBJECT,
                      properties: {
                        updates: {
                          type: Type.ARRAY,
                          description: "Fields to fill. Copy option strings exactly.",
                          items: {
                            type: Type.OBJECT,
                            properties: {
                              id: {
                                type: Type.STRING,
                                description: "Field id such as Q1",
                              },
                              value: {
                                type: Type.STRING,
                                description:
                                  "Answer text. For multi/steps, separate options with |",
                              },
                              status: {
                                type: Type.STRING,
                                description:
                                  "unanswered | partial | sufficient | unclear",
                              },
                              note: { type: Type.STRING },
                            },
                            required: ["id", "value", "status"],
                          },
                        },
                        understood: {
                          type: Type.ARRAY,
                          items: { type: Type.STRING },
                          description: "Short notes of what you understood",
                        },
                        followUpQuestion: {
                          type: Type.STRING,
                          description: "The question you are asking next",
                        },
                        screenObservation: {
                          type: Type.STRING,
                          description: "What you saw on a shared screen, if anything",
                        },
                      },
                      required: ["updates"],
                    },
                  },
                ],
              },
            ],
          },
          callbacks: {
            onopen: () => {
              setStatus("live");
            },
            onmessage: (message) => {
              const content = message.serverContent;
              if (content?.interrupted) {
                playerRef.current?.interrupt();
              }
              if (content?.modelTurn?.parts) {
                for (const part of content.modelTurn.parts) {
                  const data = part.inlineData?.data;
                  if (data) void playerRef.current?.playBase64(data);
                }
              }
              const inText = content?.inputTranscription?.text;
              if (inText) {
                inputBufRef.current += inText;
                const done = Boolean(content.inputTranscription?.finished);
                opts.onUserTranscript(inputBufRef.current.trim(), done);
                if (done) inputBufRef.current = "";
              }
              const outText = content?.outputTranscription?.text;
              if (outText) {
                outputBufRef.current += outText;
                const done = Boolean(content.outputTranscription?.finished);
                opts.onAssistantTranscript(outputBufRef.current.trim(), done);
                if (done) outputBufRef.current = "";
              }
              if (content?.turnComplete) {
                if (inputBufRef.current.trim()) {
                  opts.onUserTranscript(inputBufRef.current.trim(), true);
                  inputBufRef.current = "";
                }
                if (outputBufRef.current.trim()) {
                  opts.onAssistantTranscript(outputBufRef.current.trim(), true);
                  outputBufRef.current = "";
                }
              }
              if (message.toolCall?.functionCalls?.length) {
                handleToolCall(message.toolCall.functionCalls);
              }
            },
            onerror: () => {
              opts.onError("Gemini Live connection error.");
            },
            onclose: (event) => {
              if (ignoreCloseRef.current) return;
              teardownCapture();
              sessionRef.current = null;
              setStatus("idle");
              if (event.code && event.code !== 1000) {
                opts.onError(
                  event.reason
                    ? `Live session closed: ${event.reason}`
                    : "Live session closed unexpectedly.",
                );
              }
            },
          },
        });

        sessionRef.current = session;
        setStatus("live");
        session.sendRealtimeInput({
          text: "Please begin the intake now. Start by asking me to introduce myself.",
        });
        return true;
      } catch (error) {
        disconnect();
        opts.onError(
          error instanceof Error
            ? error.message
            : "Could not connect to Gemini Live.",
        );
        return false;
      }
    },
    [disconnect, handleToolCall, teardownCapture],
  );

  const startListening = useCallback(async () => {
    const session = sessionRef.current;
    if (!session || listeningRef.current) return;
    try {
      const stop = await startMicCapture({
        onPcm: (data) => {
          sessionRef.current?.sendRealtimeInput({
            audio: { data, mimeType: "audio/pcm;rate=16000" },
          });
        },
      });
      stopCaptureRef.current = stop;
      listeningRef.current = true;
      setListening(true);
    } catch (error) {
      connectArgsRef.current?.onError(
        error instanceof Error
          ? error.message
          : "Could not start the microphone for Live.",
      );
    }
  }, []);

  const stopListening = useCallback(() => {
    if (!listeningRef.current) return;
    teardownCapture();
    try {
      sessionRef.current?.sendRealtimeInput({ audioStreamEnd: true });
    } catch {
      /* ignore */
    }
  }, [teardownCapture]);

  const sendText = useCallback((text: string) => {
    sessionRef.current?.sendRealtimeInput({ text });
  }, []);

  const sendJpegFrame = useCallback((data: string) => {
    sessionRef.current?.sendRealtimeInput({
      video: { data, mimeType: "image/jpeg" },
    });
  }, []);

  useEffect(() => () => disconnect(), [disconnect]);

  return {
    status,
    listening,
    connect,
    disconnect,
    startListening,
    stopListening,
    sendText,
    sendJpegFrame,
  };
}
