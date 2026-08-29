import Link from "next/link";

export function Header() {
  return (
    <header className="border-b border-slate-200 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-sm font-semibold text-white">
            AI
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">
              Automation Intake
            </p>
            <p className="text-xs text-slate-500">Opportunity capture</p>
          </div>
        </Link>
        <nav className="flex items-center gap-2">
          <Link
            href="/explain"
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            Explain it
          </Link>
          <Link
            href="/"
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            New submission
          </Link>
          <Link
            href="/dashboard"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800"
          >
            Dashboard
          </Link>
        </nav>
      </div>
    </header>
  );
}
