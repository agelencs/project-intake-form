import type { Metadata } from "next";
import { Header } from "@/components/Header";

export const metadata: Metadata = {
  title: "Dashboard — Automation Intake",
};

export default function DashboardLayout({
  children,
}: LayoutProps<"/dashboard">) {
  return (
    <>
      <Header />
      <main className="flex-1 bg-slate-50">{children}</main>
    </>
  );
}
