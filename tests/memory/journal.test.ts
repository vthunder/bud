import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { unlink } from "fs/promises";
import { existsSync } from "fs";
import {
  initJournal,
  appendJournal,
  getRecentJournal,
  type JournalEntry,
} from "../../src/memory/journal";

const TEST_JOURNAL = "/tmp/test-journal.jsonl";

describe("journal", () => {
  beforeEach(async () => {
    try { await unlink(TEST_JOURNAL); } catch {}
    initJournal(TEST_JOURNAL);
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
});
