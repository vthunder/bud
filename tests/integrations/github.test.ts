import { describe, expect, test, mock, beforeEach } from "bun:test";
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
    };
    const result = formatIssueForDisplay(issue);
    expect(result).toBe("Issue #5: Bug report");
  });
});
