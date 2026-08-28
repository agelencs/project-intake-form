import { promises as fs } from "fs";
import path from "path";
import type { Submission } from "./types";

const isVercel = process.env.VERCEL === "1";

const DATA_DIR = isVercel
  ? path.join("/tmp", "automation-intake")
  : path.join(process.cwd(), "data");

const DATA_FILE = path.join(DATA_DIR, "submissions.json");
const SEED_FILE = path.join(process.cwd(), "data", "submissions.seed.json");

async function loadSeedSubmissions(): Promise<Submission[]> {
  try {
    const raw = await fs.readFile(SEED_FILE, "utf-8");
    const parsed = JSON.parse(raw) as Submission[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function ensureDataFile(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch {
    const seed = await loadSeedSubmissions();
    await fs.writeFile(
      DATA_FILE,
      JSON.stringify(seed, null, 2),
      "utf-8",
    );
  }
}

export async function readSubmissions(): Promise<Submission[]> {
  await ensureDataFile();
  const raw = await fs.readFile(DATA_FILE, "utf-8");
  try {
    const parsed = JSON.parse(raw) as Submission[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function writeSubmissions(submissions: Submission[]): Promise<void> {
  await ensureDataFile();
  await fs.writeFile(DATA_FILE, JSON.stringify(submissions, null, 2), "utf-8");
}

export async function addSubmission(submission: Submission): Promise<Submission> {
  const submissions = await readSubmissions();
  submissions.unshift(submission);
  await writeSubmissions(submissions);
  return submission;
}

export async function getSubmission(id: string): Promise<Submission | null> {
  const submissions = await readSubmissions();
  return submissions.find((s) => s.id === id) ?? null;
}

export async function deleteSubmission(id: string): Promise<boolean> {
  const submissions = await readSubmissions();
  const next = submissions.filter((s) => s.id !== id);
  if (next.length === submissions.length) return false;
  await writeSubmissions(next);
  return true;
}
