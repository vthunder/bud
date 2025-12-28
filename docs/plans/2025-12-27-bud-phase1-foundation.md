# Bud Phase 1: Foundation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a working Discord bot that responds to messages using Claude Code SDK with basic state file support.

**Architecture:** Discord.js bot receives messages, routes them through a thin agent wrapper that invokes Claude Code SDK, and persists working memory to markdown state files. The bot runs as a single long-running process on Dokku.

**Tech Stack:** Bun, TypeScript, discord.js v14, @anthropic-ai/claude-code (Claude Code SDK), Dokku for deployment.

---

## Prerequisites

Before starting, ensure you have:
- Bun installed (`curl -fsSL https://bun.sh/install | bash`)
- A Discord bot token (from Discord Developer Portal)
- An Anthropic API key
- A Dokku server with SSH access

---

## Task 1: Project Initialization

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `bunfig.toml`

**Step 1: Initialize Bun project**

Run:
```bash
bun init -y
```
Expected: Creates package.json with basic defaults

**Step 2: Configure package.json**

Replace contents of `package.json`:
```json
{
  "name": "bud",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "bun run --watch src/bot.ts",
    "start": "bun run src/bot.ts",
    "typecheck": "tsc --noEmit",
    "test": "bun test"
  },
  "dependencies": {
    "discord.js": "^14.14.1"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "^5.3.3"
  }
}
```

**Step 3: Configure TypeScript**

Create `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "declaration": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "types": ["bun-types"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 4: Create .gitignore**

Create `.gitignore`:
```
node_modules/
dist/
.env
*.log
.DS_Store
```

**Step 5: Install dependencies**

Run:
```bash
bun install
```
Expected: node_modules created, bun.lockb generated

**Step 6: Verify TypeScript setup**

Run:
```bash
bun run typecheck
```
Expected: No errors (no source files yet)

**Step 7: Commit**

```bash
git add package.json tsconfig.json .gitignore bun.lockb
git commit -m "chore: initialize bun project with typescript"
```

---

## Task 2: Discord Bot Skeleton

**Files:**
- Create: `src/bot.ts`
- Create: `src/config.ts`
- Create: `.env.example`

**Step 1: Create config module**

Create `src/config.ts`:
```typescript
export const config = {
  discord: {
    token: process.env.DISCORD_TOKEN ?? "",
    channelId: process.env.DISCORD_CHANNEL_ID ?? "",
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY ?? "",
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
```

**Step 2: Create bot entry point**

Create `src/bot.ts`:
```typescript
import { Client, Events, GatewayIntentBits, Message } from "discord.js";
import { config, validateConfig } from "./config";

validateConfig();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once(Events.ClientReady, (c) => {
  console.log(`[bud] Ready! Logged in as ${c.user.tag}`);
});

client.on(Events.MessageCreate, async (message: Message) => {
  // Ignore bot messages and messages outside our channel
  if (message.author.bot) return;
  if (message.channelId !== config.discord.channelId) return;

  console.log(`[bud] Message from ${message.author.username}: ${message.content}`);

  // Placeholder: echo for now
  await message.reply(`Echo: ${message.content}`);
});

client.login(config.discord.token);
```

**Step 3: Create .env.example**

Create `.env.example`:
```
DISCORD_TOKEN=your_discord_bot_token
DISCORD_CHANNEL_ID=your_channel_id
ANTHROPIC_API_KEY=your_anthropic_api_key
```

**Step 4: Run typecheck**

Run:
```bash
bun run typecheck
```
Expected: No errors

**Step 5: Commit**

```bash
git add src/bot.ts src/config.ts .env.example
git commit -m "feat: add discord bot skeleton with config validation"
```

---

## Task 3: State File Module (TDD)

**Files:**
- Create: `src/memory/state.ts`
- Create: `tests/memory/state.test.ts`
- Create: `state/.gitkeep`

**Step 1: Write the failing test**

Create `tests/memory/state.test.ts`:
```typescript
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
```

**Step 2: Run test to verify it fails**

Run:
```bash
bun test tests/memory/state.test.ts
```
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

Create `src/memory/state.ts`:
```typescript
import { readFile, writeFile, appendFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { dirname, join } from "path";

const DEFAULT_STATE_DIR = "./state";

export async function readState(
  filename: string,
  stateDir: string = DEFAULT_STATE_DIR
): Promise<string> {
  const filepath = join(stateDir, filename);

  if (!existsSync(filepath)) {
    return "";
  }

  return readFile(filepath, "utf-8");
}

export async function writeState(
  filename: string,
  content: string,
  stateDir: string = DEFAULT_STATE_DIR
): Promise<void> {
  const filepath = join(stateDir, filename);
  const dir = dirname(filepath);

  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }

  await writeFile(filepath, content, "utf-8");
}

export async function appendToState(
  filename: string,
  content: string,
  stateDir: string = DEFAULT_STATE_DIR
): Promise<void> {
  const filepath = join(stateDir, filename);
  const dir = dirname(filepath);

  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }

  await appendFile(filepath, content, "utf-8");
}
```

**Step 4: Run test to verify it passes**

Run:
```bash
bun test tests/memory/state.test.ts
```
Expected: All tests PASS

**Step 5: Create state directory placeholder**

```bash
mkdir -p state
touch state/.gitkeep
```

**Step 6: Commit**

```bash
git add src/memory/state.ts tests/memory/state.test.ts state/.gitkeep
git commit -m "feat: add state file read/write module with tests"
```

---

## Task 4: JSONL Logging Module (TDD)

**Files:**
- Create: `src/memory/logs.ts`
- Create: `tests/memory/logs.test.ts`

**Step 1: Write the failing test**

Create `tests/memory/logs.test.ts`:
```typescript
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { appendLog, readLogs, LogEntry } from "../../src/memory/logs";
import { mkdir, rm, readFile } from "fs/promises";
import { existsSync } from "fs";

const TEST_LOG_DIR = "./state-test/logs";

beforeEach(async () => {
  await mkdir(TEST_LOG_DIR, { recursive: true });
});

afterEach(async () => {
  if (existsSync("./state-test")) {
    await rm("./state-test", { recursive: true });
  }
});

describe("appendLog", () => {
  test("appends JSON line to log file", async () => {
    const entry: LogEntry = {
      timestamp: "2025-12-27T10:00:00Z",
      type: "interaction",
      content: "User said hello",
    };

    await appendLog("journal.jsonl", entry, TEST_LOG_DIR);

    const raw = await readFile(`${TEST_LOG_DIR}/journal.jsonl`, "utf-8");
    const parsed = JSON.parse(raw.trim());
    expect(parsed).toEqual(entry);
  });

  test("appends multiple entries on separate lines", async () => {
    const entry1: LogEntry = { timestamp: "t1", type: "a", content: "first" };
    const entry2: LogEntry = { timestamp: "t2", type: "b", content: "second" };

    await appendLog("multi.jsonl", entry1, TEST_LOG_DIR);
    await appendLog("multi.jsonl", entry2, TEST_LOG_DIR);

    const raw = await readFile(`${TEST_LOG_DIR}/multi.jsonl`, "utf-8");
    const lines = raw.trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0])).toEqual(entry1);
    expect(JSON.parse(lines[1])).toEqual(entry2);
  });
});

describe("readLogs", () => {
  test("returns empty array for non-existent file", async () => {
    const logs = await readLogs("nonexistent.jsonl", TEST_LOG_DIR);
    expect(logs).toEqual([]);
  });

  test("parses all entries from file", async () => {
    const entries = [
      { timestamp: "t1", type: "a", content: "one" },
      { timestamp: "t2", type: "b", content: "two" },
    ];
    await Bun.write(
      `${TEST_LOG_DIR}/read.jsonl`,
      entries.map((e) => JSON.stringify(e)).join("\n") + "\n"
    );

    const logs = await readLogs("read.jsonl", TEST_LOG_DIR);
    expect(logs).toEqual(entries);
  });
});
```

**Step 2: Run test to verify it fails**

Run:
```bash
bun test tests/memory/logs.test.ts
```
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

Create `src/memory/logs.ts`:
```typescript
import { appendFile, readFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { dirname, join } from "path";

const DEFAULT_LOG_DIR = "./state/logs";

export interface LogEntry {
  timestamp: string;
  type: string;
  content: string;
  [key: string]: unknown;
}

export async function appendLog(
  filename: string,
  entry: LogEntry,
  logDir: string = DEFAULT_LOG_DIR
): Promise<void> {
  const filepath = join(logDir, filename);
  const dir = dirname(filepath);

  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }

  const line = JSON.stringify(entry) + "\n";
  await appendFile(filepath, line, "utf-8");
}

export async function readLogs(
  filename: string,
  logDir: string = DEFAULT_LOG_DIR
): Promise<LogEntry[]> {
  const filepath = join(logDir, filename);

  if (!existsSync(filepath)) {
    return [];
  }

  const content = await readFile(filepath, "utf-8");
  const lines = content.trim().split("\n").filter(Boolean);

  return lines.map((line) => JSON.parse(line) as LogEntry);
}
```

**Step 4: Run test to verify it passes**

Run:
```bash
bun test tests/memory/logs.test.ts
```
Expected: All tests PASS

**Step 5: Create logs directory placeholder**

```bash
mkdir -p state/logs
touch state/logs/.gitkeep
```

**Step 6: Commit**

```bash
git add src/memory/logs.ts tests/memory/logs.test.ts state/logs/.gitkeep
git commit -m "feat: add JSONL logging module with tests"
```

---

## Task 5: Agent Module (Claude Code SDK Integration)

**Files:**
- Create: `src/agent.ts`
- Modify: `package.json` (add SDK dependency)

**Step 1: Install Claude Code SDK**

Run:
```bash
bun add @anthropic-ai/claude-code
```
Expected: Package added to package.json

**Step 2: Create agent wrapper**

Create `src/agent.ts`:
```typescript
import { query, type Tool, type Message } from "@anthropic-ai/claude-code";
import { config } from "./config";

export interface AgentContext {
  userId: string;
  username: string;
  channelId: string;
}

export interface AgentResult {
  response: string;
  toolsUsed: string[];
}

const SYSTEM_PROMPT = `You are Bud, a personal assistant and development companion.
You maintain persistent memory across conversations through state files.
If you didn't write it down, you won't remember it next message.

## Core Identity
- Helpful but not sycophantic
- Direct communication style, minimal fluff
- You respond to messages from your owner

## Current Limitations
- You are in Phase 1: basic message responses only
- No memory persistence yet (coming soon)
- No ambient compute yet (coming soon)
`;

export async function invokeAgent(
  userMessage: string,
  context: AgentContext
): Promise<AgentResult> {
  const messages: Message[] = [
    {
      role: "user",
      content: `[Context: Message from ${context.username} in channel ${context.channelId}]\n\n${userMessage}`,
    },
  ];

  const toolsUsed: string[] = [];

  const result = await query({
    prompt: messages,
    systemPrompt: SYSTEM_PROMPT,
    options: {
      maxTurns: 1,
    },
    abortController: new AbortController(),
  });

  // Extract text response
  const textBlocks = result.filter(
    (block): block is { type: "text"; text: string } => block.type === "text"
  );

  const response = textBlocks.map((b) => b.text).join("\n");

  return { response, toolsUsed };
}
```

**Step 3: Run typecheck**

Run:
```bash
bun run typecheck
```
Expected: No errors (may need to adjust types based on actual SDK)

**Step 4: Commit**

```bash
git add src/agent.ts package.json bun.lockb
git commit -m "feat: add claude code sdk agent wrapper"
```

---

## Task 6: Wire Agent to Discord Bot

**Files:**
- Modify: `src/bot.ts`

**Step 1: Update bot to use agent**

Replace `src/bot.ts`:
```typescript
import { Client, Events, GatewayIntentBits, Message } from "discord.js";
import { config, validateConfig } from "./config";
import { invokeAgent } from "./agent";
import { appendLog } from "./memory/logs";

validateConfig();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once(Events.ClientReady, (c) => {
  console.log(`[bud] Ready! Logged in as ${c.user.tag}`);
});

client.on(Events.MessageCreate, async (message: Message) => {
  // Ignore bot messages and messages outside our channel
  if (message.author.bot) return;
  if (message.channelId !== config.discord.channelId) return;

  const timestamp = new Date().toISOString();
  console.log(`[bud] ${timestamp} Message from ${message.author.username}: ${message.content}`);

  try {
    // Show typing indicator
    await message.channel.sendTyping();

    const result = await invokeAgent(message.content, {
      userId: message.author.id,
      username: message.author.username,
      channelId: message.channelId,
    });

    if (result.response) {
      await message.reply(result.response);
    }

    // Log the interaction
    await appendLog("journal.jsonl", {
      timestamp,
      type: "interaction",
      content: `User: ${message.content}\nBud: ${result.response}`,
      userId: message.author.id,
      toolsUsed: result.toolsUsed,
    });
  } catch (error) {
    console.error("[bud] Error processing message:", error);

    await appendLog("events.jsonl", {
      timestamp,
      type: "error",
      content: error instanceof Error ? error.message : String(error),
    });

    await message.reply("Sorry, I encountered an error processing your message.");
  }
});

client.login(config.discord.token);
```

**Step 2: Run typecheck**

Run:
```bash
bun run typecheck
```
Expected: No errors

**Step 3: Run all tests**

Run:
```bash
bun test
```
Expected: All tests pass

**Step 4: Commit**

```bash
git add src/bot.ts
git commit -m "feat: wire agent to discord message handler with logging"
```

---

## Task 7: Initial State Files

**Files:**
- Create: `state/inbox.md`
- Create: `state/today.md`
- Create: `state/commitments.md`

**Step 1: Create inbox.md**

Create `state/inbox.md`:
```markdown
# Inbox

Items to process. Bud checks this during perch ticks.

---

<!-- Add items below this line -->
```

**Step 2: Create today.md**

Create `state/today.md`:
```markdown
# Today

Current focus and priorities.

---

## Focus

Not yet set.

## Priorities

1. None yet
```

**Step 3: Create commitments.md**

Create `state/commitments.md`:
```markdown
# Commitments

Promises and deadlines Bud is tracking.

---

| Commitment | Due | Status |
|------------|-----|--------|
| (none yet) | -   | -      |
```

**Step 4: Commit**

```bash
git add state/inbox.md state/today.md state/commitments.md
git commit -m "feat: add initial state file templates"
```

---

## Task 8: Dokku Deployment Config

**Files:**
- Create: `Procfile`
- Create: `scripts/deploy.sh`
- Modify: `.gitignore`

**Step 1: Create Procfile**

Create `Procfile`:
```
bot: bun run src/bot.ts
```

**Step 2: Create deploy script**

Create `scripts/deploy.sh`:
```bash
#!/bin/bash
set -e

DOKKU_HOST="${DOKKU_HOST:-dokku@your-server.com}"
APP_NAME="bud"

echo "[deploy] Pushing to Dokku..."
git push dokku main

echo "[deploy] Done! Check logs with: ssh $DOKKU_HOST logs $APP_NAME -t"
```

**Step 3: Make deploy script executable**

```bash
chmod +x scripts/deploy.sh
```

**Step 4: Update .gitignore**

Append to `.gitignore`:
```
# Local env
.env

# State files (managed by Dokku storage mount)
state/logs/*.jsonl
```

**Step 5: Commit**

```bash
git add Procfile scripts/deploy.sh .gitignore
git commit -m "feat: add dokku deployment configuration"
```

---

## Task 9: CLAUDE.md System Prompt

**Files:**
- Create: `CLAUDE.md`

**Step 1: Create CLAUDE.md**

Create `CLAUDE.md`:
```markdown
# Bud

A Discord-based personal assistant with persistent memory.

## Project Structure

```
src/
├── bot.ts          # Discord bot entry point
├── agent.ts        # Claude Code SDK wrapper
├── config.ts       # Environment configuration
└── memory/
    ├── state.ts    # Markdown state file operations
    └── logs.ts     # JSONL logging operations
state/
├── inbox.md        # Items to process
├── today.md        # Current focus
├── commitments.md  # Tracked promises
└── logs/           # JSONL log files
```

## Running Locally

```bash
# Install dependencies
bun install

# Copy env template and fill in values
cp .env.example .env

# Run in development mode (with hot reload)
bun run dev

# Run tests
bun test

# Type check
bun run typecheck
```

## Deployment

Deployed to Dokku. State files are persisted via storage mount.

```bash
# First time setup on Dokku server:
dokku apps:create bud
dokku storage:mount bud /var/lib/dokku/data/storage/bud-state:/app/state
dokku config:set bud DISCORD_TOKEN=xxx DISCORD_CHANNEL_ID=xxx ANTHROPIC_API_KEY=xxx

# Deploy:
git remote add dokku dokku@server:bud
git push dokku main
```

## Current Phase

Phase 1: Foundation
- [x] Discord bot responds to messages
- [x] Claude Code SDK integration
- [x] State file read/write
- [x] JSONL logging
- [ ] Production deployment

Next: Phase 2 (Memory - Letta integration)
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add CLAUDE.md with project overview"
```

---

## Task 10: Verify Full Build

**Step 1: Run all checks**

Run:
```bash
bun run typecheck && bun test
```
Expected: All checks pass

**Step 2: Test local startup (dry run)**

Run:
```bash
timeout 5 bun run start || true
```
Expected: Should fail with missing env vars (expected behavior without .env)

**Step 3: Final commit**

```bash
git add -A
git status
```

If any uncommitted changes:
```bash
git commit -m "chore: finalize phase 1 foundation"
```

---

## Summary

After completing all tasks, you will have:

1. **Project Structure**: Bun + TypeScript configured with strict type checking
2. **Discord Bot**: Responds to messages in configured channel
3. **Claude Integration**: Agent wrapper using Claude Code SDK
4. **State Management**: Read/write markdown files with JSONL logging
5. **Deployment Ready**: Procfile and deploy script for Dokku
6. **Documentation**: CLAUDE.md with setup instructions

**Next Phase**: Phase 2 (Memory) will add Letta integration for persistent identity blocks.
