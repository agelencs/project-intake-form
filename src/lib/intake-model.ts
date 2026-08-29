import { google } from "@ai-sdk/google";

export const INTAKE_MODEL_ID = "gemini-3.7-flash";

export function hasIntakeModelKey(): boolean {
  return Boolean(
    process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.AI_GATEWAY_API_KEY,
  );
}

export function getIntakeModel() {
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return google(INTAKE_MODEL_ID);
  }
  if (process.env.AI_GATEWAY_API_KEY) {
    return `google/${INTAKE_MODEL_ID}`;
  }
  throw new Error("NO_AI_KEY");
}
