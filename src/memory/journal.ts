import { appendFile, readFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { dirname } from "path";

let journalPath: string = "./state/journal.jsonl";

export interface JournalEntry {
  ts: string;
  type: string;
  [key: string]: unknown;
}

export function initJournal(path: string): void {
  journalPath = path;
}

export function getJournalPath(): string {
  return journalPath;
}

export async function appendJournal(
  event: Omit<JournalEntry, "ts">
): Promise<void> {
  const dir = dirname(journalPath);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }

  const entry = {
    ts: new Date().toISOString(),
    ...event,
  } as JournalEntry;

  const line = JSON.stringify(entry) + "\n";
  await appendFile(journalPath, line, "utf-8");
}

export async function getRecentJournal(count: number = 40): Promise<JournalEntry[]> {
  if (!existsSync(journalPath)) {
    return [];
  }

  const content = await readFile(journalPath, "utf-8");
  const lines = content.trim().split("\n").filter(Boolean);
  const entries = lines.map((line) => JSON.parse(line) as JournalEntry);

  return entries.slice(-count);
}

export async function searchJournal(
  filter: (entry: JournalEntry) => boolean
): Promise<JournalEntry[]> {
  if (!existsSync(journalPath)) {
    return [];
  }

  const content = await readFile(journalPath, "utf-8");
  const lines = content.trim().split("\n").filter(Boolean);
  const entries = lines.map((line) => JSON.parse(line) as JournalEntry);

  return entries.filter(filter);
}

export function formatJournalForPrompt(entries: JournalEntry[]): string {
  if (entries.length === 0) return "(no recent activity)";

  return entries
    .map((e) => {
      const time = e.ts.slice(11, 19); // HH:MM:SS
      const details = Object.entries(e)
        .filter(([k]) => k !== "ts" && k !== "type")
        .map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : v}`)
        .join(" ");
      return `[${time}] ${e.type}: ${details}`;
    })
    .join("\n");
}
