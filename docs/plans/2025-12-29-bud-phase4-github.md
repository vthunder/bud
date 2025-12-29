# Bud Phase 4: GitHub Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add GitHub PR/issue monitoring and self-modification capabilities to Bud.

**Architecture:** Use `gh` CLI for GitHub API access (avoids OAuth complexity). Track seen items in a state file to prevent duplicate notifications. Integrate with perch ticks for proactive monitoring and expose MCP tools for on-demand queries.

**Tech Stack:** gh CLI, Bun, TypeScript, Zod for validation

---

## Task 1: Install gh CLI in Docker

**Files:**
- Modify: `Dockerfile`

**Step 1: Update Dockerfile to install gh CLI**

Add after the Node.js installation block:

```dockerfile
# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update \
    && apt-get install -y gh \
    && rm -rf /var/lib/apt/lists/*
```

**Step 2: Commit**

```bash
git add Dockerfile
git commit -m "feat: install gh CLI in Docker image"
```

---

## Task 2: Add GitHub Config

**Files:**
- Modify: `src/config.ts`

**Step 1: Add GitHub config section**

Add to the config object:

```typescript
github: {
  token: process.env.GITHUB_TOKEN ?? "",
  repos: (process.env.GITHUB_REPOS ?? "").split(",").filter(Boolean),
},
```

Note: Don't add GITHUB_TOKEN to required validation - it's optional (GitHub features disabled without it).

**Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add src/config.ts
git commit -m "feat: add GitHub config"
```

---

## Task 3: Create GitHub CLI Wrapper with Tests

**Files:**
- Create: `src/integrations/github.ts`
- Create: `tests/integrations/github.test.ts`

**Step 1: Write tests for GitHub wrapper**

Create `tests/integrations/github.test.ts`:

```typescript
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
```

**Step 2: Run tests to verify they fail**

Run: `bun test tests/integrations/github.test.ts`
Expected: FAIL - module not found

**Step 3: Implement GitHub wrapper**

Create `src/integrations/github.ts`:

```typescript
import { $ } from "bun";

export interface GitHubPR {
  number: number;
  title: string;
  author: { login: string };
  state: string;
  url: string;
  createdAt: string;
  updatedAt: string;
}

export interface GitHubIssue {
  number: number;
  title: string;
  state: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  assignees: { login: string }[];
}

export function parseGitHubRepoList(repoString: string): string[] {
  if (!repoString.trim()) return [];
  return repoString.split(",").map((r) => r.trim()).filter(Boolean);
}

export function formatPRForDisplay(pr: GitHubPR): string {
  return `PR #${pr.number}: ${pr.title} (by ${pr.author.login})`;
}

export function formatIssueForDisplay(issue: GitHubIssue): string {
  return `Issue #${issue.number}: ${issue.title}`;
}

export async function listPRs(repo: string, token: string): Promise<GitHubPR[]> {
  try {
    const result = await $`gh pr list --repo ${repo} --json number,title,author,state,url,createdAt,updatedAt --limit 20`
      .env({ GITHUB_TOKEN: token })
      .quiet();
    return JSON.parse(result.stdout.toString());
  } catch (error) {
    console.error(`[github] Failed to list PRs for ${repo}:`, error);
    return [];
  }
}

export async function listIssues(repo: string, token: string): Promise<GitHubIssue[]> {
  try {
    const result = await $`gh issue list --repo ${repo} --assignee @me --json number,title,state,url,createdAt,updatedAt,assignees --limit 20`
      .env({ GITHUB_TOKEN: token })
      .quiet();
    return JSON.parse(result.stdout.toString());
  } catch (error) {
    console.error(`[github] Failed to list issues for ${repo}:`, error);
    return [];
  }
}

export async function getPRDetails(repo: string, prNumber: number, token: string): Promise<GitHubPR | null> {
  try {
    const result = await $`gh pr view ${prNumber} --repo ${repo} --json number,title,author,state,url,createdAt,updatedAt,body,additions,deletions,changedFiles`
      .env({ GITHUB_TOKEN: token })
      .quiet();
    return JSON.parse(result.stdout.toString());
  } catch (error) {
    console.error(`[github] Failed to get PR #${prNumber} for ${repo}:`, error);
    return null;
  }
}

export async function getNotifications(token: string): Promise<any[]> {
  try {
    const result = await $`gh api notifications --paginate`
      .env({ GITHUB_TOKEN: token })
      .quiet();
    return JSON.parse(result.stdout.toString());
  } catch (error) {
    console.error("[github] Failed to get notifications:", error);
    return [];
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `bun test tests/integrations/github.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/integrations/github.ts tests/integrations/github.test.ts
git commit -m "feat: add GitHub CLI wrapper"
```

---

## Task 4: Create GitHub State Management with Tests

**Files:**
- Create: `src/integrations/github-state.ts`
- Create: `tests/integrations/github-state.test.ts`

**Step 1: Write tests for state management**

Create `tests/integrations/github-state.test.ts`:

```typescript
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
```

**Step 2: Run tests to verify they fail**

Run: `bun test tests/integrations/github-state.test.ts`
Expected: FAIL - module not found

**Step 3: Implement state management**

Create `src/integrations/github-state.ts`:

```typescript
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { dirname } from "path";

export interface GitHubState {
  lastCheck: string;
  seen: Record<string, string>; // key: "repo#type-number", value: ISO timestamp
}

const PRUNE_DAYS = 7;

export async function loadGitHubState(filepath: string): Promise<GitHubState> {
  if (!existsSync(filepath)) {
    return { lastCheck: "", seen: {} };
  }

  try {
    const content = await readFile(filepath, "utf-8");
    return JSON.parse(content) as GitHubState;
  } catch {
    return { lastCheck: "", seen: {} };
  }
}

export async function saveGitHubState(filepath: string, state: GitHubState): Promise<void> {
  const dir = dirname(filepath);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  await writeFile(filepath, JSON.stringify(state, null, 2), "utf-8");
}

export function isItemSeen(state: GitHubState, itemKey: string): boolean {
  return itemKey in state.seen;
}

export function markItemSeen(state: GitHubState, itemKey: string): GitHubState {
  return {
    ...state,
    seen: {
      ...state.seen,
      [itemKey]: new Date().toISOString(),
    },
  };
}

export function pruneOldEntries(state: GitHubState, now: Date = new Date()): GitHubState {
  const cutoff = now.getTime() - PRUNE_DAYS * 24 * 60 * 60 * 1000;

  const prunedSeen: Record<string, string> = {};
  for (const [key, timestamp] of Object.entries(state.seen)) {
    if (new Date(timestamp).getTime() > cutoff) {
      prunedSeen[key] = timestamp;
    }
  }

  return {
    ...state,
    seen: prunedSeen,
  };
}

export function makeItemKey(repo: string, type: "pr" | "issue", number: number): string {
  return `${repo}#${type}-${number}`;
}
```

**Step 4: Run tests to verify they pass**

Run: `bun test tests/integrations/github-state.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/integrations/github-state.ts tests/integrations/github-state.test.ts
git commit -m "feat: add GitHub state management with 7-day pruning"
```

---

## Task 5: Create GitHub MCP Tools

**Files:**
- Create: `src/tools/github.ts`

**Step 1: Implement GitHub MCP tools**

Create `src/tools/github.ts`:

```typescript
import { z } from "zod";
import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk/mcp";
import { config } from "../config";
import {
  listPRs,
  listIssues,
  getPRDetails,
  getNotifications,
  formatPRForDisplay,
  formatIssueForDisplay,
} from "../integrations/github";

export function createGitHubToolsServer() {
  const token = config.github.token;

  const githubPRsTool = tool(
    "github_prs",
    "List open pull requests. Optionally filter by repo.",
    {
      repo: z.string().optional().describe("Filter to specific repo (e.g., 'owner/repo')"),
    },
    async (args) => {
      if (!token) {
        return { content: [{ type: "text" as const, text: "GitHub not configured (no GITHUB_TOKEN)" }] };
      }

      const repos = args.repo ? [args.repo] : config.github.repos;
      if (repos.length === 0) {
        return { content: [{ type: "text" as const, text: "No repos configured" }] };
      }

      const results: string[] = [];
      for (const repo of repos) {
        const prs = await listPRs(repo, token);
        if (prs.length > 0) {
          results.push(`**${repo}:**`);
          prs.forEach((pr) => results.push(`  - ${formatPRForDisplay(pr)}`));
        }
      }

      if (results.length === 0) {
        return { content: [{ type: "text" as const, text: "No open PRs found" }] };
      }

      return { content: [{ type: "text" as const, text: results.join("\n") }] };
    }
  );

  const githubIssuesTool = tool(
    "github_issues",
    "List open issues assigned to you. Optionally filter by repo.",
    {
      repo: z.string().optional().describe("Filter to specific repo (e.g., 'owner/repo')"),
    },
    async (args) => {
      if (!token) {
        return { content: [{ type: "text" as const, text: "GitHub not configured (no GITHUB_TOKEN)" }] };
      }

      const repos = args.repo ? [args.repo] : config.github.repos;
      if (repos.length === 0) {
        return { content: [{ type: "text" as const, text: "No repos configured" }] };
      }

      const results: string[] = [];
      for (const repo of repos) {
        const issues = await listIssues(repo, token);
        if (issues.length > 0) {
          results.push(`**${repo}:**`);
          issues.forEach((issue) => results.push(`  - ${formatIssueForDisplay(issue)}`));
        }
      }

      if (results.length === 0) {
        return { content: [{ type: "text" as const, text: "No open issues assigned to you" }] };
      }

      return { content: [{ type: "text" as const, text: results.join("\n") }] };
    }
  );

  const githubPRDetailsTool = tool(
    "github_pr_details",
    "Get details of a specific pull request",
    {
      repo: z.string().describe("Repository (e.g., 'owner/repo')"),
      pr_number: z.number().describe("PR number"),
    },
    async (args) => {
      if (!token) {
        return { content: [{ type: "text" as const, text: "GitHub not configured (no GITHUB_TOKEN)" }] };
      }

      const pr = await getPRDetails(args.repo, args.pr_number, token);
      if (!pr) {
        return { content: [{ type: "text" as const, text: `PR #${args.pr_number} not found in ${args.repo}` }] };
      }

      const details = [
        `**${pr.title}** (#${pr.number})`,
        `Author: ${pr.author.login}`,
        `State: ${pr.state}`,
        `URL: ${pr.url}`,
      ];

      return { content: [{ type: "text" as const, text: details.join("\n") }] };
    }
  );

  const githubNotificationsTool = tool(
    "github_notifications",
    "Check unread GitHub notifications",
    {},
    async () => {
      if (!token) {
        return { content: [{ type: "text" as const, text: "GitHub not configured (no GITHUB_TOKEN)" }] };
      }

      const notifications = await getNotifications(token);
      if (notifications.length === 0) {
        return { content: [{ type: "text" as const, text: "No unread notifications" }] };
      }

      const items = notifications.slice(0, 10).map((n: any) =>
        `- [${n.repository.full_name}] ${n.subject.type}: ${n.subject.title}`
      );

      return { content: [{ type: "text" as const, text: items.join("\n") }] };
    }
  );

  return createSdkMcpServer({
    name: "github",
    version: "1.0.0",
    tools: [githubPRsTool, githubIssuesTool, githubPRDetailsTool, githubNotificationsTool],
  });
}

export const GITHUB_TOOL_NAMES = [
  "mcp__github__github_prs",
  "mcp__github__github_issues",
  "mcp__github__github_pr_details",
  "mcp__github__github_notifications",
];
```

**Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add src/tools/github.ts
git commit -m "feat: add GitHub MCP tools"
```

---

## Task 6: Create GitHub Activity Checker for Perch

**Files:**
- Create: `src/perch/github.ts`
- Create: `tests/perch/github.test.ts`

**Step 1: Write tests**

Create `tests/perch/github.test.ts`:

```typescript
import { describe, expect, test, mock, beforeEach } from "bun:test";
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
```

**Step 2: Run tests to verify they fail**

Run: `bun test tests/perch/github.test.ts`
Expected: FAIL - module not found

**Step 3: Implement GitHub activity checker**

Create `src/perch/github.ts`:

```typescript
import { config } from "../config";
import { listPRs, listIssues, formatPRForDisplay, formatIssueForDisplay, type GitHubPR, type GitHubIssue } from "../integrations/github";
import { loadGitHubState, saveGitHubState, isItemSeen, markItemSeen, pruneOldEntries, makeItemKey, type GitHubState } from "../integrations/github-state";

const STATE_FILE = "./state/github-seen.json";

export interface NewItems {
  prs: GitHubPR[];
  issues: GitHubIssue[];
}

export interface GitHubActivity {
  [repo: string]: NewItems;
}

export function identifyNewItems(
  repo: string,
  prs: GitHubPR[],
  issues: GitHubIssue[],
  state: GitHubState
): NewItems {
  const newPRs = prs.filter((pr) => !isItemSeen(state, makeItemKey(repo, "pr", pr.number)));
  const newIssues = issues.filter((issue) => !isItemSeen(state, makeItemKey(repo, "issue", issue.number)));

  return { prs: newPRs, issues: newIssues };
}

export function formatGitHubSummary(activity: GitHubActivity): string {
  const lines: string[] = [];

  for (const [repo, items] of Object.entries(activity)) {
    if (items.prs.length === 0 && items.issues.length === 0) continue;

    lines.push(`**${repo}:**`);
    items.prs.forEach((pr) => lines.push(`  - ${formatPRForDisplay(pr)}`));
    items.issues.forEach((issue) => lines.push(`  - ${formatIssueForDisplay(issue)}`));
  }

  return lines.join("\n");
}

export async function checkGitHubActivity(): Promise<{ activity: GitHubActivity; summary: string; hasNew: boolean }> {
  const token = config.github.token;
  const repos = config.github.repos;

  if (!token || repos.length === 0) {
    return { activity: {}, summary: "", hasNew: false };
  }

  let state = await loadGitHubState(STATE_FILE);
  const activity: GitHubActivity = {};
  let hasNew = false;

  for (const repo of repos) {
    const prs = await listPRs(repo, token);
    const issues = await listIssues(repo, token);

    const newItems = identifyNewItems(repo, prs, issues, state);

    if (newItems.prs.length > 0 || newItems.issues.length > 0) {
      activity[repo] = newItems;
      hasNew = true;

      // Mark items as seen
      newItems.prs.forEach((pr) => {
        state = markItemSeen(state, makeItemKey(repo, "pr", pr.number));
      });
      newItems.issues.forEach((issue) => {
        state = markItemSeen(state, makeItemKey(repo, "issue", issue.number));
      });
    }
  }

  // Prune old entries and save
  state = pruneOldEntries(state);
  state.lastCheck = new Date().toISOString();
  await saveGitHubState(STATE_FILE, state);

  const summary = formatGitHubSummary(activity);
  return { activity, summary, hasNew };
}
```

**Step 4: Run tests to verify they pass**

Run: `bun test tests/perch/github.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/perch/github.ts tests/perch/github.test.ts
git commit -m "feat: add GitHub activity checker for perch"
```

---

## Task 7: Integrate GitHub with Perch Context

**Files:**
- Modify: `src/perch/context.ts`

**Step 1: Add GitHub activity to perch context**

Add import at top:

```typescript
import { checkGitHubActivity } from "./github";
```

Add to `PerchContext` interface:

```typescript
githubSummary: string;
hasNewGitHub: boolean;
```

Add to `gatherPerchContext` function, after loading tasks:

```typescript
// Check GitHub activity
const { summary: githubSummary, hasNew: hasNewGitHub } = await checkGitHubActivity();
```

Update return statement to include `githubSummary` and `hasNewGitHub`.

**Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add src/perch/context.ts
git commit -m "feat: add GitHub activity to perch context"
```

---

## Task 8: Update Perch Decision Maker for GitHub

**Files:**
- Modify: `src/perch/decide.ts`

**Step 1: Add GitHub section to prompt**

In `buildPerchPrompt`, add after the due tasks section:

```typescript
const githubSection = context.hasNewGitHub
  ? `## GitHub Activity (NEW)\n${context.githubSummary}\n\nYou have new GitHub activity. Consider mentioning it.`
  : "";
```

Include `${githubSection}` in the prompt template after the due tasks section.

**Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add src/perch/decide.ts
git commit -m "feat: add GitHub activity to perch decision prompt"
```

---

## Task 9: Update Perch Context Test

**Files:**
- Modify: `tests/perch/context.test.ts`

**Step 1: Add mock for GitHub and update tests**

Add mock for GitHub module:

```typescript
const mockCheckGitHubActivity = mock(() =>
  Promise.resolve({ activity: {}, summary: "", hasNew: false })
);

mock.module("../../src/perch/github", () => ({
  checkGitHubActivity: mockCheckGitHubActivity,
}));
```

Update test expectations to include `githubSummary` and `hasNewGitHub`.

**Step 2: Run tests**

Run: `bun test tests/perch/context.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add tests/perch/context.test.ts
git commit -m "test: update context tests for GitHub integration"
```

---

## Task 10: Update Decide Test

**Files:**
- Modify: `tests/perch/decide.test.ts`

**Step 1: Add GitHub fields to baseContext**

Add to `baseContext`:

```typescript
githubSummary: "",
hasNewGitHub: false,
```

**Step 2: Run tests**

Run: `bun test tests/perch/decide.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add tests/perch/decide.test.ts
git commit -m "test: update decide tests for GitHub integration"
```

---

## Task 11: Run All Tests and Deploy

**Step 1: Run full test suite**

Run tests individually to avoid mock interference:
```bash
bun test tests/perch/tasks.test.ts && \
bun test tests/memory/logs.test.ts && \
bun test tests/memory/letta.test.ts && \
bun test tests/perch/context.test.ts && \
bun test tests/perch/decide.test.ts && \
bun test tests/tools/tasks.test.ts && \
bun test tests/integrations/github.test.ts && \
bun test tests/integrations/github-state.test.ts && \
bun test tests/perch/github.test.ts
```
Expected: All pass

**Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: No errors

**Step 3: Push to remote**

```bash
git push origin main
```

**Step 4: Set Dokku environment variables**

```bash
ssh dokku@sandmill.org config:set bud GITHUB_TOKEN=<your-github-pat>
ssh dokku@sandmill.org config:set bud GITHUB_REPOS=vthunder/bud
```

**Step 5: Deploy to Dokku**

```bash
git push dokku main
```

**Step 6: Verify gh CLI works**

```bash
ssh dokku@sandmill.org run bud gh --version
```

Expected: `gh version X.Y.Z`

---

## Summary

| Task | Description |
|------|-------------|
| 1 | Install gh CLI in Docker |
| 2 | Add GitHub config |
| 3 | Create GitHub CLI wrapper with tests |
| 4 | Create GitHub state management with tests |
| 5 | Create GitHub MCP tools |
| 6 | Create GitHub activity checker for perch |
| 7 | Integrate GitHub with perch context |
| 8 | Update perch decision maker for GitHub |
| 9 | Update perch context test |
| 10 | Update decide test |
| 11 | Run all tests and deploy |

**Key files:**
- `src/integrations/github.ts` - gh CLI wrapper
- `src/integrations/github-state.ts` - seen state management
- `src/tools/github.ts` - MCP tools
- `src/perch/github.ts` - activity checker
- `state/github-seen.json` - tracks notified items

**Environment variables:**
- `GITHUB_TOKEN` - Personal access token
- `GITHUB_REPOS` - Comma-separated list of repos to monitor
