import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdir, rm } from "fs/promises";
import { existsSync } from "fs";
import {
  loadGitHubState,
  saveGitHubState,
  isItemSeen,
  markItemSeen,
  pruneOldEntries,
  type GitHubState,
} from "../../src/integrations/github-state";

const TEST_STATE_DIR = "./state-test";
const TEST_STATE_FILE = `${TEST_STATE_DIR}/github-seen.json`;

beforeEach(async () => {
  await mkdir(TEST_STATE_DIR, { recursive: true });
});

afterEach(async () => {
  if (existsSync(TEST_STATE_DIR)) {
    await rm(TEST_STATE_DIR, { recursive: true });
  }
});

describe("loadGitHubState", () => {
  test("returns empty state if file doesn't exist", async () => {
    const state = await loadGitHubState(TEST_STATE_FILE);
    expect(state.seen).toEqual({});
  });

  test("loads existing state", async () => {
    const existing: GitHubState = {
      lastCheck: "2025-12-29T10:00:00Z",
      seen: { "repo#pr-1": "2025-12-29T10:00:00Z" },
    };
    await Bun.write(TEST_STATE_FILE, JSON.stringify(existing));

    const state = await loadGitHubState(TEST_STATE_FILE);
    expect(state.seen["repo#pr-1"]).toBe("2025-12-29T10:00:00Z");
  });
});

describe("isItemSeen", () => {
  test("returns false for unseen item", () => {
    const state: GitHubState = { lastCheck: "", seen: {} };
    expect(isItemSeen(state, "repo#pr-1")).toBe(false);
  });

  test("returns true for seen item", () => {
    const state: GitHubState = {
      lastCheck: "",
      seen: { "repo#pr-1": "2025-12-29T10:00:00Z" },
    };
    expect(isItemSeen(state, "repo#pr-1")).toBe(true);
  });
});

describe("markItemSeen", () => {
  test("adds item to seen", () => {
    const state: GitHubState = { lastCheck: "", seen: {} };
    const updated = markItemSeen(state, "repo#pr-1");
    expect(updated.seen["repo#pr-1"]).toBeDefined();
  });
});

describe("pruneOldEntries", () => {
  test("removes entries older than 7 days", () => {
    const now = new Date("2025-12-29T10:00:00Z");
    const oldDate = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const recentDate = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString();

    const state: GitHubState = {
      lastCheck: "",
      seen: {
        "repo#old": oldDate,
        "repo#recent": recentDate,
      },
    };

    const pruned = pruneOldEntries(state, now);
    expect(pruned.seen["repo#old"]).toBeUndefined();
    expect(pruned.seen["repo#recent"]).toBe(recentDate);
  });
});
