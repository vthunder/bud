import { describe, expect, test } from "bun:test";
import { identifyNewItems, formatGitHubSummary } from "../../src/perch/github";
import type { GitHubState } from "../../src/integrations/github-state";

describe("identifyNewItems", () => {
  test("returns new PRs not in seen state", () => {
    const prs = [
      { number: 1, title: "PR 1", author: { login: "user" }, state: "OPEN", url: "", createdAt: "", updatedAt: "" },
      { number: 2, title: "PR 2", author: { login: "user" }, state: "OPEN", url: "", createdAt: "", updatedAt: "" },
    ];
    const state: GitHubState = {
      lastCheck: "",
      seen: { "owner/repo#pr-1": "2025-12-29T10:00:00Z" },
    };

    const newItems = identifyNewItems("owner/repo", prs, [], state);
    expect(newItems.prs).toHaveLength(1);
    expect(newItems.prs[0].number).toBe(2);
  });

  test("returns new issues not in seen state", () => {
    const issues = [
      { number: 5, title: "Issue 5", state: "OPEN", url: "", createdAt: "", updatedAt: "", assignees: [] },
    ];
    const state: GitHubState = { lastCheck: "", seen: {} };

    const newItems = identifyNewItems("owner/repo", [], issues, state);
    expect(newItems.issues).toHaveLength(1);
  });
});

describe("formatGitHubSummary", () => {
  test("formats summary with PRs and issues", () => {
    const activity = {
      "owner/repo": {
        prs: [{ number: 1, title: "PR 1", author: { login: "user" }, state: "OPEN", url: "", createdAt: "", updatedAt: "" }],
        issues: [{ number: 5, title: "Issue 5", state: "OPEN", url: "", createdAt: "", updatedAt: "", assignees: [] }],
      },
    };

    const summary = formatGitHubSummary(activity);
    expect(summary).toContain("owner/repo");
    expect(summary).toContain("PR #1");
    expect(summary).toContain("Issue #5");
  });

  test("returns empty string for no activity", () => {
    const summary = formatGitHubSummary({});
    expect(summary).toBe("");
  });
});
