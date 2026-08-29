import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { LIVE_MODEL } from "@/lib/intake-live";
import { hasGoogleGeminiKey } from "@/lib/intake-model";

export const maxDuration = 30;

export async function POST() {
  if (!hasGoogleGeminiKey()) {
    return NextResponse.json(
      {
        error:
          "Gemini Live needs GOOGLE_GENERATIVE_AI_API_KEY on the server (the AI Gateway key is not enough for Live).",
      },
      { status: 503 },
    );
  }

  const now = Date.now();
  try {
    const ai = new GoogleGenAI({
      apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      apiVersion: "v1alpha",
      httpOptions: { apiVersion: "v1alpha" },
    });

    const token = await ai.authTokens.create({
      config: {
        uses: 1,
        expireTime: new Date(now + 30 * 60 * 1000).toISOString(),
        newSessionExpireTime: new Date(now + 8 * 60 * 1000).toISOString(),
        httpOptions: { apiVersion: "v1alpha" },
      },
    });

    if (!token.name) {
      return NextResponse.json(
        { error: "Gemini did not return a Live session token." },
        { status: 502 },
      );
    }

    return NextResponse.json({ token: token.name, model: LIVE_MODEL });
  } catch (error) {
    console.error("Live token create failed", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not mint a Gemini Live token.",
      },
      { status: 502 },
    );
  }
}
