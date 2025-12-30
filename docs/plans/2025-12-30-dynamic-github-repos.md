# Dynamic GitHub Repos Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow Bud to manage its GitHub repo watchlist through conversation using a Letta memory block.

**Architecture:** Store repo list in `github_repos` Letta memory block as JSON array. GitHub integration reads from this block. Bud updates it via existing memory tools.

**Tech Stack:** Letta SDK, TypeScript

---

## Task 1: Create Setup Script

**Files:**
- Create: `scripts/add-github-repos-block.ts`

**Step 1: Create the script**

```typescript
#!/usr/bin/env bun
import Letta from "@letta-ai/letta-client";

const baseUrl = process.env.LETTA_API_URL;
const apiKey = process.env.LETTA_API_KEY;
const agentId = process.env.LETTA_AGENT_ID;

if (!baseUrl || !apiKey || !agentId) {
  console.error("Missing required env vars: LETTA_API_URL, LETTA_API_KEY, LETTA_AGENT_ID");
  process.exit(1);
}

console.log("Connecting to:", baseUrl);
console.log("Agent ID:", agentId);

const client = new Letta({ baseURL: baseUrl, apiKey });

try {
  console.log("Creating block...");
  const block = await client.blocks.create({
    label: "github_repos",
    value: "[]",
    limit: 5000,
  });
  console.log("Created block:", block.id);

  console.log("Attaching to agent...");
  const result = await client.agents.blocks.attach(block.id, { agent_id: agentId });
  console.log("Attached successfully!");
} catch (e: any) {
  if (e.message?.includes("already exists") || e.message?.includes("duplicate")) {
    console.log("Block 'github_repos' already exists");
    process.exit(0);
  }
  console.error("Error:", e.message);
  process.exit(1);
}
```

**Step 2: Commit**

```bash
git add scripts/add-github-repos-block.ts
git commit -m "feat: add script to create github_repos memory block"
```

---

## Task 2: Add getMonitoredRepos Function

**Files:**
- Modify: `src/integrations/github.ts`
- Create: `tests/integrations/github-repos.test.ts`

**Step 1: Write test**

Create `tests/integrations/github-repos.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import { parseReposJson } from "../../src/integrations/github";

describe("parseReposJson", () => {
  test("parses valid JSON array", () => {
    const repos = parseReposJson('["owner/repo1", "owner/repo2"]');
    expect(repos).toEqual(["owner/repo1", "owner/repo2"]);
  });

  test("returns empty array for empty string", () => {
    const repos = parseReposJson("");
    expect(repos).toEqual([]);
  });

  test("returns empty array for invalid JSON", () => {
    const repos = parseReposJson("not json");
    expect(repos).toEqual([]);
  });

  test("returns empty array for non-array JSON", () => {
    const repos = parseReposJson('{"key": "value"}');
    expect(repos).toEqual([]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/integrations/github-repos.test.ts`
Expected: FAIL - function not found

**Step 3: Add function to github.ts**

Add to `src/integrations/github.ts`:

```typescript
export function parseReposJson(json: string): string[] {
  if (!json.trim()) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/integrations/github-repos.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/integrations/github.ts tests/integrations/github-repos.test.ts
git commit -m "feat: add parseReposJson function"
```

---

## Task 3: Update GitHub Config

**Files:**
- Modify: `src/config.ts`

**Step 1: Remove repos from github config**

Change:

```typescript
github: {
  token: process.env.GITHUB_TOKEN ?? "",
  repos: (process.env.GITHUB_REPOS ?? "").split(",").filter(Boolean),
},
```

To:

```typescript
github: {
  token: process.env.GITHUB_TOKEN ?? "",
},
```

**Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: Errors about `config.github.repos` no longer existing (we'll fix these next)

**Step 3: Commit**

```bash
git add src/config.ts
git commit -m "refactor: remove repos from github config"
```

---

## Task 4: Update Perch GitHub to Use Dynamic Repos

**Files:**
- Modify: `src/perch/github.ts`

**Step 1: Update imports and function signature**

Change `checkGitHubActivity` to accept repos as parameter:

```typescript
import { config } from "../config";
import { listPRs, listIssues, formatPRForDisplay, formatIssueForDisplay, type GitHubPR, type GitHubIssue } from "../integrations/github";
import { loadGitHubState, saveGitHubState, isItemSeen, markItemSeen, pruneOldEntries, makeItemKey, type GitHubState } from "../integrations/github-state";

const STATE_FILE = "./state/github-seen.json";

// ... keep interfaces ...

export async function checkGitHubActivity(repos: string[]): Promise<{ activity: GitHubActivity; summary: string; hasNew: boolean }> {
  const token = config.github.token;

  if (!token || repos.length === 0) {
    return { activity: {}, summary: "", hasNew: false };
  }

  let state = await loadGitHubState(STATE_FILE);
  const activity: GitHubActivity = {};
  let hasNew = false;

  for (const repo of repos) {
    // ... rest of the function stays the same, but uses `repos` parameter instead of `config.github.repos`
  }

  // ... rest stays the same
}
```

**Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: Errors in context.ts (caller needs updating)

**Step 3: Commit**

```bash
git add src/perch/github.ts
git commit -m "refactor: checkGitHubActivity accepts repos parameter"
```

---

## Task 5: Update Perch Context to Load Dynamic Repos

**Files:**
- Modify: `src/perch/context.ts`

**Step 1: Update context to load repos from Letta**

Add import:

```typescript
import { getMemoryBlock } from "../memory/letta";
import { parseReposJson } from "../integrations/github";
```

Update `gatherPerchContext` to load repos and pass to `checkGitHubActivity`:

```typescript
// Load GitHub repos from memory
const reposJson = await getMemoryBlock(options.lettaClient, options.agentId, "github_repos");
const githubRepos = parseReposJson(reposJson);

// Check GitHub activity
const { summary: githubSummary, hasNew: hasNewGitHub } = await checkGitHubActivity(githubRepos);
```

**Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add src/perch/context.ts
git commit -m "feat: load GitHub repos from Letta memory block"
```

---

## Task 6: Update GitHub MCP Tools

**Files:**
- Modify: `src/tools/github.ts`

**Step 1: Update tools to accept repos parameter**

The MCP tools currently use `config.github.repos`. Update them to accept repos as a parameter to `createGitHubToolsServer`:

```typescript
export function createGitHubToolsServer(repos: string[]) {
  const token = config.github.token;

  // Update each tool to use `repos` instead of `config.github.repos`
  // ...
}
```

Note: The caller will need to pass repos when creating the server.

**Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: May have errors if caller needs updating

**Step 3: Commit**

```bash
git add src/tools/github.ts
git commit -m "refactor: GitHub tools accept repos parameter"
```

---

## Task 7: Update Tests and Final Verification

**Files:**
- Modify: `tests/perch/github.test.ts`
- Modify: `tests/perch/context.test.ts`

**Step 1: Update github.test.ts**

The `checkGitHubActivity` tests need to pass repos as first parameter.

**Step 2: Update context.test.ts mock**

Add mock for `parseReposJson` or update the GitHub mock to handle the new flow.

**Step 3: Run all tests**

Run: `bun test tests/integrations/github.test.ts tests/integrations/github-repos.test.ts tests/perch/github.test.ts tests/perch/context.test.ts`
Expected: All pass

**Step 4: Run typecheck**

Run: `bun run typecheck`
Expected: No errors

**Step 5: Commit**

```bash
git add tests/
git commit -m "test: update tests for dynamic GitHub repos"
```

---

## Deployment Notes

After deploying:

1. Run the setup script to create the memory block:
   ```bash
   ssh dokku@server run bud bun scripts/add-github-repos-block.ts
   ```

2. Tell Bud to start monitoring repos:
   ```
   "Hey Bud, start monitoring vthunder/bud"
   ```
