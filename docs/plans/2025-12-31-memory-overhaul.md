# Memory Architecture Overhaul Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace Letta-based memory with local SQLite + Git architecture per `docs/bud-memory-architecture.md`.

**Architecture:** Append-only SQLite for blocks (versioned), JSONL journal for temporal context (last 40 entries in prompt), Git-tracked files for content. Data lives in separate `bud-state` directory.

**Tech Stack:** better-sqlite3, TypeScript, Git

---

## Task 1: Add SQLite Dependency

**Files:**
- Modify: `package.json`

**Step 1: Add better-sqlite3**

Run: `bun add better-sqlite3`
Run: `bun add -d @types/better-sqlite3`

**Step 2: Verify installation**

Run: `bun run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add package.json bun.lock
git commit -m "feat: add better-sqlite3 dependency"
```

---

## Task 2: Create SQLite Blocks Module

**Files:**
- Create: `src/memory/blocks.ts`
- Create: `tests/memory/blocks.test.ts`

**Step 1: Write the test**

Create `tests/memory/blocks.test.ts`:

```typescript
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
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/memory/blocks.test.ts`
Expected: FAIL - module not found

**Step 3: Implement**

Create `src/memory/blocks.ts`:

```typescript
import Database from "better-sqlite3";

let db: Database.Database | null = null;

export function initDatabase(dbPath: string): void {
  db = new Database(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_blocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      value TEXT,
      layer INTEGER NOT NULL DEFAULT 4,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_blocks_name ON memory_blocks(name);
    CREATE INDEX IF NOT EXISTS idx_blocks_layer ON memory_blocks(layer);
  `);
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

export function getDatabase(): Database.Database {
  if (!db) throw new Error("Database not initialized. Call initDatabase first.");
  return db;
}

export interface MemoryBlock {
  id: number;
  name: string;
  value: string;
  layer: number;
  created_at: string;
}

export function setBlock(name: string, value: string, layer: number = 4): void {
  const database = getDatabase();
  database.prepare(
    "INSERT INTO memory_blocks (name, value, layer) VALUES (?, ?, ?)"
  ).run(name, value, layer);
}

export function getBlock(name: string): string | null {
  const database = getDatabase();
  const row = database.prepare(
    "SELECT value FROM memory_blocks WHERE name = ? ORDER BY id DESC LIMIT 1"
  ).get(name) as { value: string } | undefined;
  return row?.value ?? null;
}

export function getAllCurrentBlocks(): Record<string, string> {
  const database = getDatabase();
  const rows = database.prepare(`
    SELECT name, value FROM memory_blocks
    WHERE id IN (SELECT MAX(id) FROM memory_blocks GROUP BY name)
    ORDER BY layer, name
  `).all() as { name: string; value: string }[];

  return Object.fromEntries(rows.map(r => [r.name, r.value]));
}

export function getBlockHistory(name: string): MemoryBlock[] {
  const database = getDatabase();
  return database.prepare(
    "SELECT * FROM memory_blocks WHERE name = ? ORDER BY id"
  ).all(name) as MemoryBlock[];
}

export function getBlocksByLayer(layer: number): Record<string, string> {
  const database = getDatabase();
  const rows = database.prepare(`
    SELECT name, value FROM memory_blocks
    WHERE id IN (SELECT MAX(id) FROM memory_blocks GROUP BY name)
    AND layer = ?
    ORDER BY name
  `).all(layer) as { name: string; value: string }[];

  return Object.fromEntries(rows.map(r => [r.name, r.value]));
}
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/memory/blocks.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/memory/blocks.ts tests/memory/blocks.test.ts
git commit -m "feat: add SQLite memory blocks with append-only semantics"
```

---

## Task 3: Create Journal Module

**Files:**
- Create: `src/memory/journal.ts`
- Create: `tests/memory/journal.test.ts`

**Step 1: Write the test**

Create `tests/memory/journal.test.ts`:

```typescript
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { unlink } from "fs/promises";
import { existsSync } from "fs";
import {
  initJournal,
  appendJournal,
  getRecentJournal,
  type JournalEntry,
} from "../../src/memory/journal";

const TEST_JOURNAL = "/tmp/test-journal.jsonl";

describe("journal", () => {
  beforeEach(async () => {
    try { await unlink(TEST_JOURNAL); } catch {}
    initJournal(TEST_JOURNAL);
  });

  test("appendJournal creates file and adds entry", async () => {
    await appendJournal({ type: "test", content: "hello" });
    expect(existsSync(TEST_JOURNAL)).toBe(true);
  });

  test("appendJournal adds timestamp", async () => {
    await appendJournal({ type: "test", content: "hello" });
    const entries = await getRecentJournal(10);
    expect(entries[0].ts).toBeDefined();
    expect(entries[0].type).toBe("test");
  });

  test("getRecentJournal returns last N entries", async () => {
    for (let i = 0; i < 50; i++) {
      await appendJournal({ type: "test", index: i });
    }
    const recent = await getRecentJournal(40);
    expect(recent).toHaveLength(40);
    expect(recent[0].index).toBe(10); // First of last 40
    expect(recent[39].index).toBe(49); // Last entry
  });

  test("getRecentJournal returns all if fewer than N", async () => {
    await appendJournal({ type: "test", index: 1 });
    await appendJournal({ type: "test", index: 2 });
    const recent = await getRecentJournal(40);
    expect(recent).toHaveLength(2);
  });

  test("entries preserve all fields", async () => {
    await appendJournal({
      type: "tool_use",
      tool: "set_block",
      args: { name: "focus" },
      result: "success",
    });
    const entries = await getRecentJournal(10);
    expect(entries[0].tool).toBe("set_block");
    expect(entries[0].args).toEqual({ name: "focus" });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/memory/journal.test.ts`
Expected: FAIL - module not found

**Step 3: Implement**

Create `src/memory/journal.ts`:

```typescript
import { appendFile, readFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { dirname } from "path";

let journalPath: string = "./state/journal.jsonl";

export interface JournalEntry {
  ts: string;
  type: string;
  [key: string]: unknown;
}

export function initJournal(path: string): void {
  journalPath = path;
}

export function getJournalPath(): string {
  return journalPath;
}

export async function appendJournal(
  event: Omit<JournalEntry, "ts">
): Promise<void> {
  const dir = dirname(journalPath);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }

  const entry: JournalEntry = {
    ts: new Date().toISOString(),
    ...event,
  };

  const line = JSON.stringify(entry) + "\n";
  await appendFile(journalPath, line, "utf-8");
}

export async function getRecentJournal(count: number = 40): Promise<JournalEntry[]> {
  if (!existsSync(journalPath)) {
    return [];
  }

  const content = await readFile(journalPath, "utf-8");
  const lines = content.trim().split("\n").filter(Boolean);
  const entries = lines.map((line) => JSON.parse(line) as JournalEntry);

  return entries.slice(-count);
}

export async function searchJournal(
  filter: (entry: JournalEntry) => boolean
): Promise<JournalEntry[]> {
  if (!existsSync(journalPath)) {
    return [];
  }

  const content = await readFile(journalPath, "utf-8");
  const lines = content.trim().split("\n").filter(Boolean);
  const entries = lines.map((line) => JSON.parse(line) as JournalEntry);

  return entries.filter(filter);
}

export function formatJournalForPrompt(entries: JournalEntry[]): string {
  if (entries.length === 0) return "(no recent activity)";

  return entries
    .map((e) => {
      const time = e.ts.slice(11, 19); // HH:MM:SS
      const details = Object.entries(e)
        .filter(([k]) => k !== "ts" && k !== "type")
        .map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : v}`)
        .join(" ");
      return `[${time}] ${e.type}: ${details}`;
    })
    .join("\n");
}
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/memory/journal.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/memory/journal.ts tests/memory/journal.test.ts
git commit -m "feat: add journal module for temporal context"
```

---

## Task 4: Create Memory Tools Server

**Files:**
- Create: `src/tools/blocks.ts`
- Modify: `src/tools/memory.ts` (rename to keep task scheduling)

**Step 1: Create new blocks tools server**

Create `src/tools/blocks.ts`:

```typescript
import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import {
  getBlock,
  setBlock,
  getAllCurrentBlocks,
  getBlockHistory,
  getBlocksByLayer,
} from "../memory/blocks";
import { appendJournal } from "../memory/journal";

export function createBlockToolsServer() {
  const getBlockTool = tool(
    "get_block",
    "Read a memory block. Layers: 2=identity (persona, values), 3=semantic (owner_context, patterns), 4=working (focus, goals, schedule)",
    {
      name: z.string().describe("Block name (e.g., 'persona', 'focus', 'owner_context')"),
    },
    async (args) => {
      const value = getBlock(args.name);
      await appendJournal({ type: "read", target: `block:${args.name}` });
      return {
        content: [{
          type: "text" as const,
          text: value ?? `(block '${args.name}' not found)`,
        }],
      };
    }
  );

  const setBlockTool = tool(
    "set_block",
    "Update a memory block. Creates new version (old versions preserved). Layer 4 for working state, 3 for learned patterns.",
    {
      name: z.string().describe("Block name"),
      value: z.string().describe("New content"),
      layer: z.number().optional().describe("Layer: 2=identity, 3=semantic, 4=working (default)"),
    },
    async (args) => {
      const layer = args.layer ?? 4;
      if (layer === 2) {
        return {
          content: [{
            type: "text" as const,
            text: "Cannot modify identity blocks (layer 2). These require owner approval.",
          }],
        };
      }
      setBlock(args.name, args.value, layer);
      await appendJournal({
        type: "block_update",
        block: args.name,
        layer,
        preview: args.value.slice(0, 100),
      });
      return {
        content: [{
          type: "text" as const,
          text: `Updated block '${args.name}'`,
        }],
      };
    }
  );

  const listBlocksTool = tool(
    "list_blocks",
    "List all memory blocks with their current values",
    {},
    async () => {
      const blocks = getAllCurrentBlocks();
      const list = Object.entries(blocks)
        .map(([name, value]) => `${name}: ${value.slice(0, 100)}${value.length > 100 ? "..." : ""}`)
        .join("\n");
      return {
        content: [{
          type: "text" as const,
          text: list || "(no blocks)",
        }],
      };
    }
  );

  const blockHistoryTool = tool(
    "block_history",
    "Get version history of a memory block for recovery or analysis",
    {
      name: z.string().describe("Block name"),
      limit: z.number().optional().describe("Max versions to return (default 10)"),
    },
    async (args) => {
      const history = getBlockHistory(args.name);
      const limited = history.slice(-(args.limit ?? 10));
      const formatted = limited
        .map((h) => `[${h.created_at}] ${h.value.slice(0, 80)}${h.value.length > 80 ? "..." : ""}`)
        .join("\n");
      return {
        content: [{
          type: "text" as const,
          text: formatted || `(no history for '${args.name}')`,
        }],
      };
    }
  );

  return createSdkMcpServer({
    name: "memory",
    version: "2.0.0",
    tools: [getBlockTool, setBlockTool, listBlocksTool, blockHistoryTool],
  });
}

export const BLOCK_TOOL_NAMES = [
  "mcp__memory__get_block",
  "mcp__memory__set_block",
  "mcp__memory__list_blocks",
  "mcp__memory__block_history",
];
```

**Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/tools/blocks.ts
git commit -m "feat: add memory block tools for new SQLite backend"
```

---

## Task 5: Create Prompt Builder

**Files:**
- Create: `src/prompt.ts`
- Create: `tests/prompt.test.ts`

**Step 1: Write the test**

Create `tests/prompt.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import { buildSystemPrompt, type PromptContext } from "../src/prompt";

describe("buildSystemPrompt", () => {
  const baseContext: PromptContext = {
    identity: { persona: "Test persona", values: "Test values" },
    semantic: { owner_context: "Test owner" },
    working: { focus: "Test focus" },
    journal: [],
    skills: ["skill-a", "skill-b"],
  };

  test("includes identity blocks", () => {
    const prompt = buildSystemPrompt(baseContext);
    expect(prompt).toContain("Test persona");
    expect(prompt).toContain("Test values");
  });

  test("includes working state", () => {
    const prompt = buildSystemPrompt(baseContext);
    expect(prompt).toContain("Test focus");
  });

  test("includes recent journal section", () => {
    const context: PromptContext = {
      ...baseContext,
      journal: [
        { ts: "2025-12-31T10:00:00Z", type: "test", content: "entry1" },
        { ts: "2025-12-31T10:01:00Z", type: "test", content: "entry2" },
      ],
    };
    const prompt = buildSystemPrompt(context);
    expect(prompt).toContain("Recent Activity");
    expect(prompt).toContain("entry1");
  });

  test("includes available skills", () => {
    const prompt = buildSystemPrompt(baseContext);
    expect(prompt).toContain("skill-a");
    expect(prompt).toContain("skill-b");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/prompt.test.ts`
Expected: FAIL - module not found

**Step 3: Implement**

Create `src/prompt.ts`:

```typescript
import { formatJournalForPrompt, type JournalEntry } from "./memory/journal";

export interface PromptContext {
  identity: Record<string, string>;   // Layer 2: persona, values, style
  semantic: Record<string, string>;   // Layer 3: owner_context, patterns
  working: Record<string, string>;    // Layer 4: focus, goals, schedule
  journal: JournalEntry[];            // Last 40 entries
  skills: string[];                   // Available skill names
}

export function buildSystemPrompt(context: PromptContext): string {
  const { identity, semantic, working, journal, skills } = context;

  return `You are Bud, a personal AI agent and second brain.
You maintain persistent memory across conversations. If you didn't write it down, you won't remember it.

## Identity

${identity.persona || "Helpful but not sycophantic. Direct communication style."}

${identity.values ? `### Values\n${identity.values}` : ""}

${identity.communication_style ? `### Communication Style\n${identity.communication_style}` : ""}

## Context

${semantic.owner_context ? `### About Your Owner\n${semantic.owner_context}` : ""}

${semantic.patterns ? `### Learned Patterns\n${semantic.patterns}` : ""}

## Current State

${working.focus ? `### Current Focus\n${working.focus}` : "No specific focus set."}

${working.goals ? `### Active Goals\n${working.goals}` : ""}

${working.schedule ? `### Schedule\n${working.schedule}` : ""}

## Memory Tools

You have tools to persist information:
- **get_block**: Read a memory block
- **set_block**: Update a memory block (creates new version, history preserved)
- **list_blocks**: See all blocks
- **block_history**: View past versions of a block

Update memory when you learn something important. Blocks by layer:
- Layer 2 (identity): persona, values - owner-controlled, you cannot modify
- Layer 3 (semantic): owner_context, patterns - update when you learn new patterns
- Layer 4 (working): focus, goals, schedule - update frequently as context changes

## Available Skills

${skills.length > 0 ? skills.map(s => `- ${s}`).join("\n") : "(no skills loaded)"}

Skills are loaded on-demand. Invoke by name when capability is needed.

## Recent Activity

This is your recent activity (train of thought across invocations):

${formatJournalForPrompt(journal)}

Use this to maintain continuity. You can see what you were working on and why.

## Guidelines

- Be proactive: notice things, suggest actions, follow up
- Be quiet by default: only speak when warranted
- Update memory: persist anything important
- Log decisions: your reasoning helps future you understand past actions
`;
}

export function buildFullPrompt(
  context: PromptContext,
  trigger: { type: string; content: string; from?: string }
): string {
  const systemPrompt = buildSystemPrompt(context);

  let triggerText: string;
  if (trigger.type === "message" && trigger.from) {
    triggerText = `[Message from ${trigger.from}]: ${trigger.content}`;
  } else if (trigger.type === "perch") {
    triggerText = `[Perch tick]: ${trigger.content}`;
  } else if (trigger.type === "cron") {
    triggerText = `[Scheduled job]: ${trigger.content}`;
  } else {
    triggerText = trigger.content;
  }

  return `${systemPrompt}\n\n---\n\n${triggerText}`;
}
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/prompt.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/prompt.ts tests/prompt.test.ts
git commit -m "feat: add prompt builder with layered context"
```

---

## Task 6: Update Config

**Files:**
- Modify: `src/config.ts`

**Step 1: Update config**

Replace Letta config with state config in `src/config.ts`:

```typescript
export const config = {
  discord: {
    token: process.env.DISCORD_TOKEN ?? "",
    channelId: process.env.DISCORD_CHANNEL_ID ?? "",
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY ?? "",
  },
  state: {
    path: process.env.STATE_PATH ?? "/app/state",
    dbName: "memory.db",
    journalName: "journal.jsonl",
  },
  github: {
    token: process.env.GITHUB_TOKEN ?? "",
  },
  replicate: {
    apiToken: process.env.REPLICATE_API_TOKEN ?? "",
  },
  calendar: {
    serviceAccountJson: process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? "",
    calendarIds: (process.env.GOOGLE_CALENDAR_IDS ?? "").split(",").filter(Boolean),
  },
  skills: {
    path: process.env.SKILLS_PATH || "/app/state/.claude/skills",
  },
} as const;

export function validateConfig(): void {
  const required = [
    ["DISCORD_TOKEN", config.discord.token],
    ["DISCORD_CHANNEL_ID", config.discord.channelId],
    ["ANTHROPIC_API_KEY", config.anthropic.apiKey],
  ] as const;

  const missing = required.filter(([, value]) => !value).map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
}

export function getDbPath(): string {
  return `${config.state.path}/${config.state.dbName}`;
}

export function getJournalPath(): string {
  return `${config.state.path}/${config.state.journalName}`;
}
```

**Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: PASS (may have errors in agent.ts due to Letta removal - that's expected)

**Step 3: Commit**

```bash
git add src/config.ts
git commit -m "feat: replace Letta config with local state config"
```

---

## Task 7: Update Agent

**Files:**
- Modify: `src/agent.ts`

**Step 1: Rewrite agent.ts**

Replace entire `src/agent.ts`:

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";
import type { Client } from "discord.js";
import { config, getDbPath, getJournalPath } from "./config";
import { initDatabase, getBlocksByLayer } from "./memory/blocks";
import { initJournal, appendJournal, getRecentJournal } from "./memory/journal";
import { buildFullPrompt, type PromptContext } from "./prompt";
import { createBlockToolsServer, BLOCK_TOOL_NAMES } from "./tools/blocks";
import { createCalendarToolsServer, CALENDAR_TOOL_NAMES } from "./tools/calendar";
import { createGitHubToolsServer, GITHUB_TOOL_NAMES } from "./tools/github";
import { createImageToolsServer, IMAGE_TOOL_NAMES } from "./tools/images";
import { loadSkills, listSkillNames } from "./skills";

export interface AgentContext {
  userId: string;
  username: string;
  channelId: string;
  discordClient: Client;
}

export interface AgentResult {
  response: string;
  toolsUsed: string[];
}

let initialized = false;

function ensureInitialized(): void {
  if (!initialized) {
    initDatabase(getDbPath());
    initJournal(getJournalPath());
    initialized = true;
  }
}

async function loadPromptContext(): Promise<PromptContext> {
  const identity = getBlocksByLayer(2);
  const semantic = getBlocksByLayer(3);
  const working = getBlocksByLayer(4);
  const journal = await getRecentJournal(40);
  const skills = await listSkillNames(config.skills.path);

  return { identity, semantic, working, journal, skills };
}

export async function invokeAgent(
  userMessage: string,
  context: AgentContext
): Promise<AgentResult> {
  ensureInitialized();

  try {
    // Log the trigger
    await appendJournal({
      type: "trigger",
      source: "message",
      from: context.username,
      preview: userMessage.slice(0, 100),
    });

    // Load context for prompt
    const promptContext = await loadPromptContext();

    // Build prompt
    const prompt = buildFullPrompt(promptContext, {
      type: "message",
      from: context.username,
      content: userMessage,
    });

    // Create MCP servers
    const memoryServer = createBlockToolsServer();
    const calendarServer = createCalendarToolsServer();
    const imageServer = createImageToolsServer(context.discordClient, context.channelId);

    // Get GitHub repos from working state
    const reposJson = promptContext.working.github_repos;
    const githubRepos = reposJson ? JSON.parse(reposJson) : [];
    const githubServer = createGitHubToolsServer(githubRepos);

    const toolsUsed: string[] = [];
    let responseText = "";

    const result = query({
      prompt,
      options: {
        permissionMode: "bypassPermissions",
        mcpServers: {
          memory: memoryServer,
          calendar: calendarServer,
          github: githubServer,
          images: imageServer,
        },
        allowedTools: [
          ...BLOCK_TOOL_NAMES,
          ...CALENDAR_TOOL_NAMES,
          ...GITHUB_TOOL_NAMES,
          ...IMAGE_TOOL_NAMES,
        ],
        pathToClaudeCodeExecutable: "/usr/bin/claude",
      },
    });

    for await (const message of result) {
      if (message.type === "assistant" && "message" in message) {
        for (const block of message.message.content) {
          if (block.type === "text") {
            responseText += block.text;
          } else if (block.type === "tool_use") {
            toolsUsed.push(block.name);
            // Log tool use
            await appendJournal({
              type: "tool_use",
              tool: block.name,
              args: block.input,
            });
          }
        }
      } else if (message.type === "result" && "result" in message) {
        if (message.result) {
          responseText = message.result;
        }
      }
    }

    // Log response
    await appendJournal({
      type: "message_sent",
      channel: "discord",
      preview: responseText.slice(0, 100),
    });

    return {
      response: responseText || "I apologize, but I couldn't generate a response.",
      toolsUsed,
    };
  } catch (error) {
    console.error("[agent] Error:", error);
    await appendJournal({
      type: "error",
      context: "agent invocation",
      error: String(error),
    });
    return {
      response: "I encountered an error processing your request. Please try again.",
      toolsUsed: [],
    };
  }
}
```

**Step 2: Update skills.ts to export listSkillNames**

Add to `src/skills.ts`:

```typescript
export async function listSkillNames(skillsDir: string): Promise<string[]> {
  try {
    const files = await readdir(skillsDir);
    return files.filter((f) => f.endsWith(".md")).map((f) => f.replace(".md", ""));
  } catch {
    return [];
  }
}
```

**Step 3: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add src/agent.ts src/skills.ts
git commit -m "feat: rewrite agent to use new memory system"
```

---

## Task 8: Remove Letta Dependencies

**Files:**
- Delete: `src/memory/letta.ts`
- Modify: `src/tools/memory.ts` (keep task tools, remove Letta memory tools)
- Modify: `package.json` (remove @letta-ai/letta-client)

**Step 1: Remove Letta package**

Run: `bun remove @letta-ai/letta-client`

**Step 2: Delete letta.ts**

Run: `rm src/memory/letta.ts`

**Step 3: Update tools/memory.ts to only have task scheduling**

Keep only the schedule_task, cancel_task, list_tasks tools. Remove the Letta-based get_memory, set_memory, list_memory.

Update the imports and exports to use the new blocks module for any block operations needed by task scheduling.

**Step 4: Run typecheck and fix any remaining issues**

Run: `bun run typecheck`

Fix any import errors.

**Step 5: Run all tests**

Run: `bun test`
Expected: PASS (some tests may need updating)

**Step 6: Commit**

```bash
git add -A
git commit -m "refactor: remove Letta dependency, use local SQLite"
```

---

## Task 9: Initialize Default Blocks

**Files:**
- Create: `scripts/init-memory.ts`

**Step 1: Create initialization script**

Create `scripts/init-memory.ts`:

```typescript
#!/usr/bin/env bun
import { initDatabase, setBlock, getBlock } from "../src/memory/blocks";
import { initJournal, appendJournal } from "../src/memory/journal";
import { config, getDbPath, getJournalPath } from "../src/config";

const DEFAULT_BLOCKS = {
  // Layer 2: Identity
  persona: `Helpful but not sycophantic. Direct communication style, minimal fluff.
I am Bud, a personal AI agent and second brain.
I maintain persistent memory and work autonomously toward goals.
I am proactive, resilient, and cost-aware.`,

  values: `- Useful: I exist to be useful to my owner
- Honest: I provide accurate information and admit uncertainty
- Proactive: I notice things and suggest actions
- Quiet: I only speak when warranted`,

  // Layer 3: Semantic
  owner_context: "(Not yet set. Use set_block to add owner context.)",
  patterns: "(No patterns observed yet.)",

  // Layer 4: Working
  focus: "(No focus set.)",
  goals: "(No active goals.)",
  schedule: "(No schedule.)",
  github_repos: "[]",
};

async function main() {
  console.log("Initializing Bud memory...");
  console.log(`Database: ${getDbPath()}`);
  console.log(`Journal: ${getJournalPath()}`);

  initDatabase(getDbPath());
  initJournal(getJournalPath());

  for (const [name, value] of Object.entries(DEFAULT_BLOCKS)) {
    const existing = getBlock(name);
    if (existing === null) {
      const layer = name === "persona" || name === "values" ? 2 :
                    name === "owner_context" || name === "patterns" ? 3 : 4;
      setBlock(name, value, layer);
      console.log(`Created block: ${name} (layer ${layer})`);
    } else {
      console.log(`Block exists: ${name}`);
    }
  }

  await appendJournal({
    type: "system",
    event: "memory_initialized",
    blocks: Object.keys(DEFAULT_BLOCKS),
  });

  console.log("Memory initialized successfully.");
}

main().catch(console.error);
```

**Step 2: Make executable**

Run: `chmod +x scripts/init-memory.ts`

**Step 3: Test locally**

Run: `STATE_PATH=/tmp/bud-test bun scripts/init-memory.ts`
Expected: Creates database and initializes blocks

**Step 4: Commit**

```bash
git add scripts/init-memory.ts
git commit -m "feat: add memory initialization script"
```

---

## Task 10: Update Perch for New Memory System

**Files:**
- Modify: `src/perch.ts`
- Modify: `src/perch/context.ts`

**Step 1: Update perch/context.ts**

Update to use new memory system instead of Letta:

```typescript
import { getBlocksByLayer, getBlock } from "../memory/blocks";
import { getRecentJournal } from "../memory/journal";
import { buildFullPrompt, type PromptContext } from "../prompt";
import { listSkillNames } from "../skills";
import { config } from "../config";

export async function loadPerchContext(): Promise<PromptContext> {
  const identity = getBlocksByLayer(2);
  const semantic = getBlocksByLayer(3);
  const working = getBlocksByLayer(4);
  const journal = await getRecentJournal(40);
  const skills = await listSkillNames(config.skills.path);

  return { identity, semantic, working, journal, skills };
}
```

**Step 2: Update perch.ts to initialize database**

Add initialization at the start of perch execution.

**Step 3: Run typecheck**

Run: `bun run typecheck`

**Step 4: Commit**

```bash
git add src/perch.ts src/perch/context.ts
git commit -m "feat: update perch to use new memory system"
```

---

## Task 11: Update Bot Entry Point

**Files:**
- Modify: `src/bot.ts`

**Step 1: Add database initialization**

Add initialization at startup:

```typescript
import { initDatabase } from "./memory/blocks";
import { initJournal } from "./memory/journal";
import { getDbPath, getJournalPath } from "./config";

// Initialize memory at startup
initDatabase(getDbPath());
initJournal(getJournalPath());
```

**Step 2: Run typecheck**

Run: `bun run typecheck`

**Step 3: Test locally**

Run: `STATE_PATH=/tmp/bud-test bun src/bot.ts`
Expected: Bot starts (may fail on Discord connection without token, but should initialize)

**Step 4: Commit**

```bash
git add src/bot.ts
git commit -m "feat: initialize memory on bot startup"
```

---

## Task 12: Final Integration Test

**Step 1: Run all tests**

Run: `bun test`
Expected: All tests pass

**Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: No errors

**Step 3: Local end-to-end test**

```bash
# Initialize test state
STATE_PATH=/tmp/bud-e2e bun scripts/init-memory.ts

# Check database was created
ls -la /tmp/bud-e2e/

# Start bot (will fail without Discord token, but validates startup)
STATE_PATH=/tmp/bud-e2e DISCORD_TOKEN=test DISCORD_CHANNEL_ID=test ANTHROPIC_API_KEY=test bun src/bot.ts
```

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: integration test fixes"
```

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat: complete memory architecture overhaul"
```

---

## Deployment Notes

After all tasks complete:

1. **Server setup:**
   ```bash
   # Create state directory on server
   ssh dokku@sandmill.org run bud mkdir -p /app/state

   # Initialize memory
   ssh dokku@sandmill.org run bud bun scripts/init-memory.ts
   ```

2. **Environment variables:**
   - Remove: `LETTA_API_URL`, `LETTA_API_KEY`, `LETTA_AGENT_ID`
   - Keep: `STATE_PATH=/app/state` (default)

3. **Backup:**
   - `memory.db` and `journal.jsonl` are in persistent storage
   - Consider git-tracking the state directory separately

4. **Migration:**
   - Export any important data from Letta before switching
   - Or start fresh (as discussed)
