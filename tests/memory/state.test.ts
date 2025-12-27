import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { readState, writeState, appendToState } from "../../src/memory/state";
import { mkdir, rm, readFile } from "fs/promises";
import { existsSync } from "fs";

const TEST_STATE_DIR = "./state-test";

beforeEach(async () => {
  await mkdir(TEST_STATE_DIR, { recursive: true });
});

afterEach(async () => {
  if (existsSync(TEST_STATE_DIR)) {
    await rm(TEST_STATE_DIR, { recursive: true });
  }
});

describe("readState", () => {
  test("returns empty string for non-existent file", async () => {
    const content = await readState("nonexistent.md", TEST_STATE_DIR);
    expect(content).toBe("");
  });

  test("reads existing file content", async () => {
    await Bun.write(`${TEST_STATE_DIR}/test.md`, "# Test\n\nContent here");
    const content = await readState("test.md", TEST_STATE_DIR);
    expect(content).toBe("# Test\n\nContent here");
  });
});

describe("writeState", () => {
  test("creates file with content", async () => {
    await writeState("new.md", "# New File\n\nHello", TEST_STATE_DIR);
    const content = await readFile(`${TEST_STATE_DIR}/new.md`, "utf-8");
    expect(content).toBe("# New File\n\nHello");
  });

  test("overwrites existing file", async () => {
    await Bun.write(`${TEST_STATE_DIR}/existing.md`, "old content");
    await writeState("existing.md", "new content", TEST_STATE_DIR);
    const content = await readFile(`${TEST_STATE_DIR}/existing.md`, "utf-8");
    expect(content).toBe("new content");
  });
});

describe("appendToState", () => {
  test("appends to existing file", async () => {
    await Bun.write(`${TEST_STATE_DIR}/append.md`, "line1\n");
    await appendToState("append.md", "line2\n", TEST_STATE_DIR);
    const content = await readFile(`${TEST_STATE_DIR}/append.md`, "utf-8");
    expect(content).toBe("line1\nline2\n");
  });

  test("creates file if not exists", async () => {
    await appendToState("new-append.md", "first line\n", TEST_STATE_DIR);
    const content = await readFile(`${TEST_STATE_DIR}/new-append.md`, "utf-8");
    expect(content).toBe("first line\n");
  });
});
