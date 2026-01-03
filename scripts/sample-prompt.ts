#!/usr/bin/env bun
/**
 * Output a sample prompt showing all injected content.
 * Usage: bun scripts/sample-prompt.ts [--journal N]
 *
 * Options:
 *   --journal N   Number of journal entries to include (default: 40)
 */

import { Database } from "bun:sqlite";
import { getDbPath, getJournalPath } from "../src/config";
import { readFileSync, existsSync } from "fs";

const args = process.argv.slice(2);
const journalCount = args.includes("--journal")
  ? parseInt(args[args.indexOf("--journal") + 1], 10)
  : 40;

const db = new Database(getDbPath(), { readonly: true });

interface BlockRow {
  name: string;
  value: string;
  layer: number;
}

function getBlocksByLayer(layer: number): BlockRow[] {
  const query = `
    SELECT name, value, layer
    FROM memory_blocks
    WHERE layer = ? AND id IN (SELECT MAX(id) FROM memory_blocks WHERE layer = ? GROUP BY name)
    ORDER BY name
  `;
  return db.query(query).all(layer, layer) as BlockRow[];
}

// Get journal entries
interface JournalEntry {
  timestamp?: string;
  type?: string;
  content?: string;
  preview?: string;
  tool?: string;
  input?: string;
  work_type?: string;
  summary?: string;
  [key: string]: unknown;
}

function getRecentJournalEntries(count: number): JournalEntry[] {
  const journalPath = getJournalPath();
  if (!existsSync(journalPath)) {
    return [];
  }

  const content = readFileSync(journalPath, "utf-8");
  const lines = content.trim().split("\n").filter(Boolean);
  const entries: JournalEntry[] = [];

  for (const line of lines.slice(-count)) {
    try {
      entries.push(JSON.parse(line));
    } catch {
      // Skip malformed lines
    }
  }

  return entries;
}

const l1Blocks = getBlocksByLayer(1);
const l2Blocks = getBlocksByLayer(2);
const l3Blocks = getBlocksByLayer(3);
const journalEntries = getRecentJournalEntries(journalCount);

// Build the sample prompt
console.log("=".repeat(70));
console.log("SAMPLE PROMPT - What Bud sees on each invocation");
console.log("=".repeat(70));

console.log(`
┌──────────────────────────────────────────────────────────────────────┐
│ SYSTEM PROMPT (from code - not shown here)                           │
└──────────────────────────────────────────────────────────────────────┘
`);

console.log("┌──────────────────────────────────────────────────────────────────────┐");
console.log("│ LAYER 1: IDENTITY                                                    │");
console.log("└──────────────────────────────────────────────────────────────────────┘");
for (const block of l1Blocks) {
  console.log(`\n## ${block.name}\n`);
  console.log(block.value);
}

console.log("\n┌──────────────────────────────────────────────────────────────────────┐");
console.log("│ LAYER 2: SEMANTIC                                                    │");
console.log("└──────────────────────────────────────────────────────────────────────┘");
for (const block of l2Blocks) {
  console.log(`\n## ${block.name}\n`);
  console.log(block.value);
}

console.log("\n┌──────────────────────────────────────────────────────────────────────┐");
console.log("│ LAYER 3: WORKING                                                     │");
console.log("└──────────────────────────────────────────────────────────────────────┘");
for (const block of l3Blocks) {
  // Skip internal state blocks for cleaner output
  if (block.name === "bud_state") {
    console.log(`\n## ${block.name}\n`);
    try {
      const state = JSON.parse(block.value);
      console.log(`status: ${state.status}`);
      console.log(`current_task: ${state.current_task || "(none)"}`);
    } catch {
      console.log(block.value);
    }
  } else {
    console.log(`\n## ${block.name}\n`);
    console.log(block.value);
  }
}

console.log("\n┌──────────────────────────────────────────────────────────────────────┐");
console.log(`│ RECENT JOURNAL (last ${journalEntries.length} entries)${" ".repeat(Math.max(0, 36 - String(journalEntries.length).length))}│`);
console.log("└──────────────────────────────────────────────────────────────────────┘\n");

if (journalEntries.length === 0) {
  console.log("(No journal entries)");
} else {
  for (const entry of journalEntries) {
    const ts = entry.timestamp ? new Date(entry.timestamp).toISOString().slice(0, 19) : "?";
    const type = entry.type || "?";

    // Format based on entry type
    switch (type) {
      case "trigger":
        console.log(`[${ts}] TRIGGER: ${entry.content || entry.preview || "(no content)"}`);
        break;
      case "response":
        const preview = entry.content?.slice(0, 100) || "(no content)";
        console.log(`[${ts}] RESPONSE: ${preview}${(entry.content?.length || 0) > 100 ? "..." : ""}`);
        break;
      case "tool_use":
        console.log(`[${ts}] TOOL: ${entry.tool || "?"} ${entry.input ? `(${entry.input})` : ""}`);
        break;
      case "work_completed":
        console.log(`[${ts}] WORK: ${entry.work_type || "?"} - ${entry.summary || "(no summary)"}`);
        break;
      case "decision":
        console.log(`[${ts}] DECISION: ${entry.content || "(no content)"}`);
        break;
      case "error":
        console.log(`[${ts}] ERROR: ${entry.content || "(no content)"}`);
        break;
      default:
        console.log(`[${ts}] ${type.toUpperCase()}: ${JSON.stringify(entry).slice(0, 100)}`);
    }
  }
}

console.log("\n┌──────────────────────────────────────────────────────────────────────┐");
console.log("│ CURRENT TRIGGER                                                      │");
console.log("└──────────────────────────────────────────────────────────────────────┘");
console.log("\n(Would be filled in with the actual trigger - user message, scheduled task, etc.)\n");

// Stats
console.log("=".repeat(70));
console.log("STATS");
console.log("=".repeat(70));

let totalChars = 0;
for (const block of [...l1Blocks, ...l2Blocks, ...l3Blocks]) {
  totalChars += block.value.length;
}
for (const entry of journalEntries) {
  totalChars += JSON.stringify(entry).length;
}

console.log(`L1 blocks: ${l1Blocks.length}`);
console.log(`L2 blocks: ${l2Blocks.length}`);
console.log(`L3 blocks: ${l3Blocks.length}`);
console.log(`Journal entries: ${journalEntries.length}`);
console.log(`Approximate prompt size: ${(totalChars / 1000).toFixed(1)}k chars (~${(totalChars / 4000).toFixed(1)}k tokens)`);

db.close();
