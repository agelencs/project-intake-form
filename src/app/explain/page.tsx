import { Header } from "@/components/Header";
import { ExplainSession } from "@/components/ExplainSession";

export const metadata = {
  title: "Explain it — Automation Intake",
  description: "Describe an automation opportunity by talking, typing, or sharing your screen.",
};

export default function ExplainPage() {
  return (
    <>
      <Header />
      <main className="flex-1 bg-slate-50">
        <div className="mx-auto max-w-6xl px-6 pb-16 pt-10">
          <div className="mb-8 max-w-2xl">
            <p className="text-sm font-medium text-slate-500">Conversational intake</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
              Explain it rather than type it
            </h1>
            <p className="mt-3 text-slate-500">
              Start by introducing yourself, then talk through the work with a voice agent.
              It fills the same form as you go. Share your screen if pointing is easier.
            </p>
          </div>
          <ExplainSession />
        </div>
      </main>
    </>
  );
}
