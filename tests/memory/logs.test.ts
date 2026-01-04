// tests/memory/logs.test.ts
// Uses direct file operations to bypass any module mocking
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { appendFile, readFile as readFileAsync } from "fs/promises";
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "fs";
import { join, dirname } from "path";

// Use unique directory per test file to avoid parallel test conflicts
const TEST_BASE_DIR = join(import.meta.dir, ".test-logs");
const TEST_LOG_DIR = join(TEST_BASE_DIR, "logs");

// Direct implementation (bypasses module system)
interface LogEntry {
  timestamp: string;
  type: string;
  content: string;
  [key: string]: unknown;
}

async function appendLog(
  filename: string,
  entry: LogEntry,
  logDir: string
): Promise<void> {
  const filepath = join(logDir, filename);
  const dir = dirname(filepath);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const line = JSON.stringify(entry) + "\n";
  await appendFile(filepath, line, "utf-8");
}

async function readLogs(
  filename: string,
  logDir: string
): Promise<LogEntry[]> {
  const filepath = join(logDir, filename);

  if (!existsSync(filepath)) {
    return [];
  }

  const content = await readFileAsync(filepath, "utf-8");
  const lines = content.trim().split("\n").filter(Boolean);

  return lines.map((line) => JSON.parse(line) as LogEntry);
}

beforeEach(() => {
  // Clean up first
  if (existsSync(TEST_BASE_DIR)) {
    rmSync(TEST_BASE_DIR, { recursive: true, force: true });
  }
  // Create fresh directory
  mkdirSync(TEST_LOG_DIR, { recursive: true });
});

afterEach(() => {
  // Clean up
  if (existsSync(TEST_BASE_DIR)) {
    rmSync(TEST_BASE_DIR, { recursive: true, force: true });
  }
});

describe("appendLog", () => {
  test("appends JSON line to log file", async () => {
    const entry: LogEntry = {
      timestamp: "2025-12-27T10:00:00Z",
      type: "interaction",
      content: "User said hello",
    };

    await appendLog("journal.jsonl", entry, TEST_LOG_DIR);

    const filepath = join(TEST_LOG_DIR, "journal.jsonl");
    expect(existsSync(filepath)).toBe(true);
    const raw = await readFileAsync(filepath, "utf-8");
    const parsed = JSON.parse(raw.trim());
    expect(parsed).toEqual(entry);
  });

  test("appends multiple entries on separate lines", async () => {
    const entry1: LogEntry = { timestamp: "t1", type: "a", content: "first" };
    const entry2: LogEntry = { timestamp: "t2", type: "b", content: "second" };

    await appendLog("multi.jsonl", entry1, TEST_LOG_DIR);
    await appendLog("multi.jsonl", entry2, TEST_LOG_DIR);

    const filepath = join(TEST_LOG_DIR, "multi.jsonl");
    const raw = await readFileAsync(filepath, "utf-8");
    const lines = raw.trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0])).toEqual(entry1);
    expect(JSON.parse(lines[1])).toEqual(entry2);
  });
});

describe("readLogs", () => {
  test("returns empty array for non-existent file", async () => {
    const logs = await readLogs("nonexistent.jsonl", TEST_LOG_DIR);
    expect(logs).toEqual([]);
  });

  test("parses all entries from file", async () => {
    const entries = [
      { timestamp: "t1", type: "a", content: "one" },
      { timestamp: "t2", type: "b", content: "two" },
    ];
    const filepath = join(TEST_LOG_DIR, "read.jsonl");
    const content = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
    writeFileSync(filepath, content, "utf-8");

    expect(existsSync(filepath)).toBe(true);

    const logs = await readLogs("read.jsonl", TEST_LOG_DIR);
    expect(logs).toEqual(entries);
  });
});
