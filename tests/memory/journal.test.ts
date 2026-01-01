import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import {
  initJournal,
  appendJournal,
  getRecentJournal,
  searchJournal,
  formatJournalForPrompt,
  type JournalEntry,
} from "../../src/memory/journal";

const TEST_DIR = join(import.meta.dir, ".test-journal");
const TEST_JOURNAL = join(TEST_DIR, "journal.jsonl");

describe("journal", () => {
  beforeEach(() => {
    // Clean up and recreate test directory
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
    initJournal(TEST_JOURNAL);
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  test("appendJournal creates file and adds entry", async () => {
    await appendJournal({ type: "test", content: "hello" });
    expect(existsSync(TEST_JOURNAL)).toBe(true);
  });

  test("appendJournal adds timestamp", async () => {
    await appendJournal({ type: "test", content: "hello" });
    const entries = await getRecentJournal(10);
    expect(entries[0].ts).toBeDefined();
    expect(entries[0].type).toBe("test");
  });

  test("getRecentJournal returns last N entries", async () => {
    for (let i = 0; i < 50; i++) {
      await appendJournal({ type: "test", index: i });
    }
    const recent = await getRecentJournal(40);
    expect(recent).toHaveLength(40);
    expect(recent[0].index).toBe(10); // First of last 40
    expect(recent[39].index).toBe(49); // Last entry
  });

  test("getRecentJournal returns all if fewer than N", async () => {
    await appendJournal({ type: "test", index: 1 });
    await appendJournal({ type: "test", index: 2 });
    const recent = await getRecentJournal(40);
    expect(recent).toHaveLength(2);
  });

  test("entries preserve all fields", async () => {
    await appendJournal({
      type: "tool_use",
      tool: "set_block",
      args: { name: "focus" },
      result: "success",
    });
    const entries = await getRecentJournal(10);
    expect(entries[0].tool).toBe("set_block");
    expect(entries[0].args).toEqual({ name: "focus" });
  });

  test("searchJournal filters by predicate", async () => {
    await appendJournal({ type: "error", message: "failed" });
    await appendJournal({ type: "success", message: "worked" });
    await appendJournal({ type: "error", message: "another failure" });
    const errors = await searchJournal((e) => e.type === "error");
    expect(errors).toHaveLength(2);
  });

  test("formatJournalForPrompt formats entries for prompt", async () => {
    await appendJournal({ type: "test", data: "value" });
    const entries = await getRecentJournal(10);
    const formatted = formatJournalForPrompt(entries);
    expect(formatted).toContain("[");
    expect(formatted).toContain("] test:");
    expect(formatted).toContain("data=value");
  });

  test("formatJournalForPrompt returns placeholder for empty", () => {
    const formatted = formatJournalForPrompt([]);
    expect(formatted).toBe("(no recent activity)");
  });
});
