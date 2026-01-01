import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync } from "fs";
import { join } from "path";
import {
  initDatabase,
  getBlock,
  setBlock,
  getAllCurrentBlocks,
  getBlockHistory,
  closeDatabase,
} from "../../src/memory/blocks";

const TEST_DIR = join(import.meta.dir, ".test-blocks");
const TEST_DB = join(TEST_DIR, "test.db");

describe("memory blocks", () => {
  beforeEach(() => {
    // Always close any existing database first to prevent global state pollution
    closeDatabase();
    // Clean up and recreate test directory
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
    initDatabase(TEST_DB);
  });

  afterEach(() => {
    closeDatabase();
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  test("setBlock and getBlock", () => {
    setBlock("persona", "helpful assistant", 2);
    const value = getBlock("persona");
    expect(value).toBe("helpful assistant");
  });

  test("setBlock creates new version, not update", () => {
    setBlock("focus", "task A", 4);
    setBlock("focus", "task B", 4);

    const current = getBlock("focus");
    expect(current).toBe("task B");

    const history = getBlockHistory("focus");
    expect(history).toHaveLength(2);
    expect(history[0].value).toBe("task A");
    expect(history[1].value).toBe("task B");
  });

  test("getBlock returns null for missing block", () => {
    const value = getBlock("nonexistent");
    expect(value).toBeNull();
  });

  test("getAllCurrentBlocks returns latest of each", () => {
    setBlock("persona", "v1", 2);
    setBlock("persona", "v2", 2);
    setBlock("focus", "current", 4);

    const blocks = getAllCurrentBlocks();
    expect(blocks.persona).toBe("v2");
    expect(blocks.focus).toBe("current");
  });

  test("blocks ordered by layer", () => {
    setBlock("focus", "working", 4);
    setBlock("persona", "identity", 2);
    setBlock("patterns", "semantic", 3);

    const blocks = getAllCurrentBlocks();
    const keys = Object.keys(blocks);
    // Should be ordered: persona (2), patterns (3), focus (4)
    expect(keys).toEqual(["persona", "patterns", "focus"]);
  });
});
