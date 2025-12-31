import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { unlink } from "fs/promises";
import {
  initDatabase,
  getBlock,
  setBlock,
  getAllCurrentBlocks,
  getBlockHistory,
  closeDatabase,
} from "../../src/memory/blocks";

const TEST_DB = "/tmp/test-bud-memory.db";

describe("memory blocks", () => {
  beforeEach(async () => {
    try { await unlink(TEST_DB); } catch {}
    initDatabase(TEST_DB);
  });

  afterEach(() => {
    closeDatabase();
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
