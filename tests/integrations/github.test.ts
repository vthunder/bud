import { describe, expect, test } from "bun:test";
import { parseGitHubRepoList, formatPRForDisplay, formatIssueForDisplay } from "../../src/integrations/github";

describe("parseGitHubRepoList", () => {
  test("parses comma-separated repos", () => {
    const repos = parseGitHubRepoList("owner/repo1,owner/repo2");
    expect(repos).toEqual(["owner/repo1", "owner/repo2"]);
  });

  test("trims whitespace", () => {
    const repos = parseGitHubRepoList(" owner/repo1 , owner/repo2 ");
    expect(repos).toEqual(["owner/repo1", "owner/repo2"]);
  });

  test("returns empty array for empty string", () => {
    const repos = parseGitHubRepoList("");
    expect(repos).toEqual([]);
  });
});

describe("formatPRForDisplay", () => {
  test("formats PR with author", () => {
    const pr = {
      number: 12,
      title: "Add feature",
      author: { login: "user1" },
      state: "OPEN",
      url: "https://github.com/owner/repo/pull/12",
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-02T00:00:00Z",
    };
    const result = formatPRForDisplay(pr);
    expect(result).toBe("PR #12: Add feature (by user1)");
  });
});

describe("formatIssueForDisplay", () => {
  test("formats issue", () => {
    const issue = {
      number: 5,
      title: "Bug report",
      state: "OPEN",
      url: "https://github.com/owner/repo/issues/5",
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-02T00:00:00Z",
      assignees: [{ login: "user1" }],
    };
    const result = formatIssueForDisplay(issue);
    expect(result).toBe("Issue #5: Bug report");
  });
});
