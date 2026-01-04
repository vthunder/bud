/**
 * Working Memory (Layer 2)
 *
 * Transient state that changes frequently during operation.
 * Includes focus, inbox, commitments, and recent journal entries.
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { config } from "../config";

export interface JournalEntry {
  ts: string;
  type: string;
  [key: string]: unknown;
}

function getWorkingDir(): string {
  return join(config.state.path, "2_working");
}

function ensureWorkingDir(): void {
  const dir = getWorkingDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

// ============ Focus ============

export function getFocus(): string {
  const path = join(getWorkingDir(), "focus.md");
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf-8");
}

export function setFocus(content: string): void {
  ensureWorkingDir();
  writeFileSync(join(getWorkingDir(), "focus.md"), content);
}

// ============ Inbox ============

export function getInbox(): string {
  const path = join(getWorkingDir(), "inbox.md");
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf-8");
}

export function setInbox(content: string): void {
  ensureWorkingDir();
  writeFileSync(join(getWorkingDir(), "inbox.md"), content);
}

// ============ Commitments ============

export function getCommitments(): string {
  const path = join(getWorkingDir(), "commitments.md");
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf-8");
}

export function setCommitments(content: string): void {
  ensureWorkingDir();
  writeFileSync(join(getWorkingDir(), "commitments.md"), content);
}

// ============ Journal ============

function getJournalPath(): string {
  return join(getWorkingDir(), "journal.jsonl");
}

export function appendJournal(event: Omit<JournalEntry, "ts">): void {
  ensureWorkingDir();
  const entry = {
    ts: new Date().toISOString(),
    type: event.type,
    ...event,
  };
  const line = JSON.stringify(entry) + "\n";
  appendFileSync(getJournalPath(), line, "utf-8");
}

export function getRecentJournal(count: number = 20): JournalEntry[] {
  const path = getJournalPath();
  if (!existsSync(path)) return [];

  const content = readFileSync(path, "utf-8");
  const lines = content.trim().split("\n").filter(Boolean);
  const entries = lines.map((line) => JSON.parse(line) as JournalEntry);

  return entries.slice(-count);
}

export function getJournalEntriesSince(sinceTs: string): JournalEntry[] {
  const path = getJournalPath();
  if (!existsSync(path)) return [];

  const content = readFileSync(path, "utf-8");
  const lines = content.trim().split("\n").filter(Boolean);
  const entries = lines.map((line) => JSON.parse(line) as JournalEntry);

  return entries.filter((e) => e.ts > sinceTs);
}

export function searchJournal(
  filter: (entry: JournalEntry) => boolean
): JournalEntry[] {
  const path = getJournalPath();
  if (!existsSync(path)) return [];

  const content = readFileSync(path, "utf-8");
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

// ============ Working Memory Summary ============

export interface WorkingMemory {
  focus: string;
  inbox: string;
  commitments: string;
  recentJournal: JournalEntry[];
}

export function loadWorkingMemory(journalCount: number = 20): WorkingMemory {
  return {
    focus: getFocus(),
    inbox: getInbox(),
    commitments: getCommitments(),
    recentJournal: getRecentJournal(journalCount),
  };
}
