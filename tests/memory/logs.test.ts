import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { appendLog, readLogs, LogEntry } from "../../src/memory/logs";
import { mkdir, rm, readFile } from "fs/promises";
import { existsSync } from "fs";

const TEST_LOG_DIR = "./state-test/logs";

beforeEach(async () => {
  await mkdir(TEST_LOG_DIR, { recursive: true });
});

afterEach(async () => {
  if (existsSync("./state-test")) {
    await rm("./state-test", { recursive: true });
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

    const raw = await readFile(`${TEST_LOG_DIR}/journal.jsonl`, "utf-8");
    const parsed = JSON.parse(raw.trim());
    expect(parsed).toEqual(entry);
  });

  test("appends multiple entries on separate lines", async () => {
    const entry1: LogEntry = { timestamp: "t1", type: "a", content: "first" };
    const entry2: LogEntry = { timestamp: "t2", type: "b", content: "second" };

    await appendLog("multi.jsonl", entry1, TEST_LOG_DIR);
    await appendLog("multi.jsonl", entry2, TEST_LOG_DIR);

    const raw = await readFile(`${TEST_LOG_DIR}/multi.jsonl`, "utf-8");
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
    await Bun.write(
      `${TEST_LOG_DIR}/read.jsonl`,
      entries.map((e) => JSON.stringify(e)).join("\n") + "\n"
    );

    const logs = await readLogs("read.jsonl", TEST_LOG_DIR);
    expect(logs).toEqual(entries);
  });
});
