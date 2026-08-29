import Link from "next/link";
import { Header } from "@/components/Header";
import { IntakeForm } from "@/components/IntakeForm";

export default function HomePage() {
  return (
    <>
      <Header />
      <main className="flex-1 bg-slate-50">
        <div className="mx-auto max-w-6xl px-6 pb-16 pt-10">
          <div className="mb-10 text-center">
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
              Capture an automation opportunity
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-slate-500">
              A structured intake for business teams. Answer in plain language —
              we score impact and feasibility automatically and add it to your backlog.
            </p>
            <div className="mt-6">
              <Link
                href="/explain"
                className="inline-flex items-center rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800"
              >
                Explain it rather than type it
              </Link>
              <p className="mt-2 text-xs text-slate-400">
                Talk with a voice agent, share your screen, then review the same form before submitting.
              </p>
            </div>
          </div>
          <IntakeForm />
        </div>
      </main>
    </>
  );
}
