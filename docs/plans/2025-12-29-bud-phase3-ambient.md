# Bud Phase 3: Ambient Compute Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add "perch tick" capability so Bud can proactively speak in Discord when the LLM decides something is worth saying.

**Architecture:** Create a separate `perch.ts` script that runs via Dokku cron every 2 hours. It gathers context (time, recent interactions, Letta memory) and asks the LLM whether anything is worth saying. Most ticks produce no output. When something is worth saying, it posts to Discord.

**Tech Stack:** Bun, TypeScript, Discord.js, Letta SDK, Dokku cron

**Design Decision:** Trigger conditions are intentionally vague - the LLM decides what's worth speaking up about. Quiet hours are deferred (not implemented in this phase).

---

## Task 1: Create Discord Message Sender Utility

**Files:**
- Create: `src/discord/sender.ts`
- Create: `tests/discord/sender.test.ts`

The perch script needs to send messages without the full bot client. Create a lightweight sender.

**Step 1: Write the failing test**

Create `tests/discord/sender.test.ts`:

```typescript
import { describe, expect, test, mock, beforeEach } from "bun:test";

// Mock discord.js
const mockSend = mock(() => Promise.resolve({ id: "msg-123" }));
const mockFetch = mock(() =>
  Promise.resolve({ send: mockSend })
);
const mockLogin = mock(() => Promise.resolve("token"));
const mockDestroy = mock(() => Promise.resolve());

mock.module("discord.js", () => ({
  Client: class MockClient {
    channels = { fetch: mockFetch };
    login = mockLogin;
    destroy = mockDestroy;
  },
  GatewayIntentBits: { Guilds: 1 },
}));

const { sendMessage } = await import("../../src/discord/sender");

describe("sendMessage", () => {
  beforeEach(() => {
    mockSend.mockClear();
    mockFetch.mockClear();
    mockLogin.mockClear();
    mockDestroy.mockClear();
  });

  test("sends message to channel and cleans up", async () => {
    mockSend.mockResolvedValueOnce({ id: "msg-456" });

    const result = await sendMessage({
      token: "test-token",
      channelId: "channel-123",
      content: "Hello from perch!",
    });

    expect(mockLogin).toHaveBeenCalledWith("test-token");
    expect(mockFetch).toHaveBeenCalledWith("channel-123");
    expect(mockSend).toHaveBeenCalledWith("Hello from perch!");
    expect(mockDestroy).toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.messageId).toBe("msg-456");
  });

  test("returns error on failure", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Channel not found"));

    const result = await sendMessage({
      token: "test-token",
      channelId: "bad-channel",
      content: "Hello",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Channel not found");
    expect(mockDestroy).toHaveBeenCalled();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/discord/sender.test.ts`
Expected: FAIL - module not found

**Step 3: Implement the sender**

Create `src/discord/sender.ts`:

```typescript
import { Client, GatewayIntentBits, type TextChannel } from "discord.js";

export interface SendMessageOptions {
  token: string;
  channelId: string;
  content: string;
}

export interface SendMessageResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export async function sendMessage(
  options: SendMessageOptions
): Promise<SendMessageResult> {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
  });

  try {
    await client.login(options.token);

    const channel = await client.channels.fetch(options.channelId);
    if (!channel || !("send" in channel)) {
      throw new Error("Channel not found or not a text channel");
    }

    const message = await (channel as TextChannel).send(options.content);

    return {
      success: true,
      messageId: message.id,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await client.destroy();
  }
}
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/discord/sender.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/discord/sender.ts tests/discord/sender.test.ts
git commit -m "feat: add Discord message sender utility"
```

---

## Task 2: Create Perch Context Gatherer

**Files:**
- Create: `src/perch/context.ts`
- Create: `tests/perch/context.test.ts`

Gather context for the perch tick: current time, recent interactions, Letta memory.

**Step 1: Write the failing test**

Create `tests/perch/context.test.ts`:

```typescript
import { describe, expect, test, mock, beforeEach } from "bun:test";

// Mock dependencies
const mockReadLogs = mock(() => Promise.resolve([]));
const mockLoadContext = mock(() =>
  Promise.resolve({
    persona: "Test persona",
    currentFocus: "Test focus",
    ownerContext: "Test owner",
    timezone: "UTC",
  })
);

mock.module("../../src/memory/logs", () => ({
  readLogs: mockReadLogs,
}));

mock.module("../../src/memory/letta", () => ({
  loadContext: mockLoadContext,
  createLettaClient: () => ({}),
}));

const { gatherPerchContext } = await import("../../src/perch/context");

describe("gatherPerchContext", () => {
  beforeEach(() => {
    mockReadLogs.mockClear();
    mockLoadContext.mockClear();
  });

  test("gathers time, memory, and recent interactions", async () => {
    const now = new Date("2025-12-29T14:00:00Z");
    mockReadLogs.mockResolvedValueOnce([
      {
        timestamp: "2025-12-29T12:00:00Z",
        type: "interaction",
        content: "User: hello\nBud: hi there",
      },
    ]);

    const context = await gatherPerchContext({
      lettaClient: {} as any,
      agentId: "agent-123",
      now,
    });

    expect(context.currentTime).toBe("2025-12-29T14:00:00.000Z");
    expect(context.hourOfDay).toBe(14);
    expect(context.dayOfWeek).toBe("Sunday");
    expect(context.memory.persona).toBe("Test persona");
    expect(context.recentInteractions).toHaveLength(1);
    expect(context.hoursSinceLastInteraction).toBe(2);
  });

  test("handles no recent interactions", async () => {
    mockReadLogs.mockResolvedValueOnce([]);

    const context = await gatherPerchContext({
      lettaClient: {} as any,
      agentId: "agent-123",
      now: new Date(),
    });

    expect(context.recentInteractions).toHaveLength(0);
    expect(context.hoursSinceLastInteraction).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/perch/context.test.ts`
Expected: FAIL - module not found

**Step 3: Implement context gatherer**

Create `src/perch/context.ts`:

```typescript
import type Letta from "@letta-ai/letta-client";
import { readLogs, type LogEntry } from "../memory/logs";
import { loadContext, type BudContext } from "../memory/letta";

export interface PerchContext {
  currentTime: string;
  hourOfDay: number;
  dayOfWeek: string;
  memory: BudContext;
  recentInteractions: LogEntry[];
  hoursSinceLastInteraction: number | null;
}

export interface GatherContextOptions {
  lettaClient: Letta;
  agentId: string;
  now?: Date;
  lookbackHours?: number;
}

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export async function gatherPerchContext(
  options: GatherContextOptions
): Promise<PerchContext> {
  const now = options.now ?? new Date();
  const lookbackHours = options.lookbackHours ?? 24;
  const cutoff = new Date(now.getTime() - lookbackHours * 60 * 60 * 1000);

  // Load Letta memory
  const memory = await loadContext(options.lettaClient, options.agentId);

  // Read recent journal entries
  const allLogs = await readLogs("journal.jsonl");
  const recentInteractions = allLogs.filter(
    (log) => new Date(log.timestamp) >= cutoff
  );

  // Calculate hours since last interaction
  let hoursSinceLastInteraction: number | null = null;
  if (recentInteractions.length > 0) {
    const lastTimestamp = recentInteractions[recentInteractions.length - 1].timestamp;
    const lastTime = new Date(lastTimestamp);
    hoursSinceLastInteraction = (now.getTime() - lastTime.getTime()) / (1000 * 60 * 60);
  }

  return {
    currentTime: now.toISOString(),
    hourOfDay: now.getUTCHours(),
    dayOfWeek: DAYS[now.getUTCDay()],
    memory,
    recentInteractions,
    hoursSinceLastInteraction,
  };
}
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/perch/context.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/perch/context.ts tests/perch/context.test.ts
git commit -m "feat: add perch context gatherer"
```

---

## Task 3: Create Perch Decision Maker

**Files:**
- Create: `src/perch/decide.ts`
- Create: `tests/perch/decide.test.ts`

Ask the LLM if anything is worth saying. Returns null if silent, or a message to send.

**Step 1: Write the failing test**

Create `tests/perch/decide.test.ts`:

```typescript
import { describe, expect, test, mock, beforeEach } from "bun:test";
import type { PerchContext } from "../../src/perch/context";

// Mock the Claude query
const mockQueryResult = {
  [Symbol.asyncIterator]: async function* () {
    yield {
      type: "result",
      result: "SPEAK: Good morning! Just checking in.",
    };
  },
};
const mockQuery = mock(() => mockQueryResult);

mock.module("@anthropic-ai/claude-agent-sdk", () => ({
  query: mockQuery,
}));

const { decidePerchAction } = await import("../../src/perch/decide");

describe("decidePerchAction", () => {
  const baseContext: PerchContext = {
    currentTime: "2025-12-29T09:00:00Z",
    hourOfDay: 9,
    dayOfWeek: "Sunday",
    memory: {
      persona: "Helpful assistant",
      currentFocus: "Project work",
      ownerContext: "Works on software",
      timezone: "UTC",
    },
    recentInteractions: [],
    hoursSinceLastInteraction: null,
  };

  beforeEach(() => {
    mockQuery.mockClear();
  });

  test("returns message when LLM says SPEAK", async () => {
    const result = await decidePerchAction(baseContext);

    expect(result).not.toBeNull();
    expect(result?.message).toBe("Good morning! Just checking in.");
    expect(mockQuery).toHaveBeenCalled();
  });

  test("returns null when LLM says SILENT", async () => {
    mockQuery.mockReturnValueOnce({
      [Symbol.asyncIterator]: async function* () {
        yield { type: "result", result: "SILENT" };
      },
    });

    const result = await decidePerchAction(baseContext);

    expect(result).toBeNull();
  });

  test("returns null on empty response", async () => {
    mockQuery.mockReturnValueOnce({
      [Symbol.asyncIterator]: async function* () {
        yield { type: "result", result: "" };
      },
    });

    const result = await decidePerchAction(baseContext);

    expect(result).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/perch/decide.test.ts`
Expected: FAIL - module not found

**Step 3: Implement decision maker**

Create `src/perch/decide.ts`:

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";
import type { PerchContext } from "./context";

export interface PerchDecision {
  message: string;
  reason?: string;
}

function buildPerchPrompt(context: PerchContext): string {
  const interactionSummary =
    context.recentInteractions.length > 0
      ? context.recentInteractions
          .slice(-5)
          .map((i) => `[${i.timestamp}] ${i.content}`)
          .join("\n\n")
      : "No recent interactions.";

  const timeSinceChat = context.hoursSinceLastInteraction
    ? `${context.hoursSinceLastInteraction.toFixed(1)} hours ago`
    : "Never";

  return `You are Bud, a personal assistant. This is a "perch tick" - a periodic check-in where you decide whether to proactively message your owner.

## Your Personality
${context.memory.persona || "Helpful but not sycophantic. Direct communication."}

## Current Focus
${context.memory.currentFocus || "No specific focus."}

## About Your Owner
${context.memory.ownerContext || "No owner context."}

## Current Context
- Time: ${context.currentTime}
- Day: ${context.dayOfWeek}
- Hour (UTC): ${context.hourOfDay}
- Timezone: ${context.memory.timezone || "UTC"}
- Last interaction: ${timeSinceChat}

## Recent Interactions (last 24h)
${interactionSummary}

## Your Task
Decide whether to proactively send a message to your owner RIGHT NOW.

Most of the time, you should stay SILENT. Only speak if:
- You have something genuinely useful or relevant to say
- The timing feels right (consider time of day, day of week)
- It's been a while and a check-in feels natural
- You notice something worth commenting on

If you decide to speak, keep it brief and natural - this is a casual check-in, not a formal report.

## Response Format
If you decide to stay silent, respond with exactly:
SILENT

If you decide to speak, respond with:
SPEAK: [your message here]

Respond now:`;
}

export async function decidePerchAction(
  context: PerchContext
): Promise<PerchDecision | null> {
  try {
    const prompt = buildPerchPrompt(context);

    let responseText = "";
    const result = query({
      prompt,
      options: {
        permissionMode: "bypassPermissions",
        allowedTools: [],
        pathToClaudeCodeExecutable: "/usr/bin/claude",
      },
    });

    for await (const message of result) {
      if (message.type === "result" && "result" in message) {
        responseText = message.result ?? "";
      }
    }

    responseText = responseText.trim();

    if (!responseText || responseText === "SILENT") {
      return null;
    }

    if (responseText.startsWith("SPEAK:")) {
      const message = responseText.slice(6).trim();
      return message ? { message } : null;
    }

    // Unexpected format - treat as message if it looks like one
    if (responseText.length > 0 && responseText.length < 500) {
      return { message: responseText };
    }

    return null;
  } catch (error) {
    console.error("[perch] Decision error:", error);
    return null;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/perch/decide.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/perch/decide.ts tests/perch/decide.test.ts
git commit -m "feat: add perch decision maker"
```

---

## Task 4: Create Perch Main Script

**Files:**
- Create: `src/perch.ts`

The main entry point for perch ticks. Orchestrates context gathering, decision making, and message sending.

**Step 1: Create the perch script**

Create `src/perch.ts`:

```typescript
#!/usr/bin/env bun
import { config, validateConfig } from "./config";
import { createLettaClient } from "./memory/letta";
import { gatherPerchContext } from "./perch/context";
import { decidePerchAction } from "./perch/decide";
import { sendMessage } from "./discord/sender";
import { appendLog } from "./memory/logs";

async function main() {
  const timestamp = new Date().toISOString();
  console.log(`[perch] Starting perch tick at ${timestamp}`);

  try {
    validateConfig();
  } catch (error) {
    console.error("[perch] Config validation failed:", error);
    process.exit(1);
  }

  // Create Letta client
  const lettaClient = createLettaClient({
    baseURL: config.letta.baseUrl,
    apiKey: config.letta.apiKey,
  });

  // Gather context
  console.log("[perch] Gathering context...");
  const context = await gatherPerchContext({
    lettaClient,
    agentId: config.letta.agentId,
  });

  // Make decision
  console.log("[perch] Deciding action...");
  const decision = await decidePerchAction(context);

  if (!decision) {
    console.log("[perch] Decision: SILENT");
    await appendLog("perch.jsonl", {
      timestamp,
      type: "perch_tick",
      content: "SILENT",
      context: {
        hourOfDay: context.hourOfDay,
        dayOfWeek: context.dayOfWeek,
        hoursSinceLastInteraction: context.hoursSinceLastInteraction,
      },
    });
    return;
  }

  console.log(`[perch] Decision: SPEAK - "${decision.message}"`);

  // Send message
  const result = await sendMessage({
    token: config.discord.token,
    channelId: config.discord.channelId,
    content: decision.message,
  });

  if (result.success) {
    console.log(`[perch] Message sent: ${result.messageId}`);
    await appendLog("perch.jsonl", {
      timestamp,
      type: "perch_tick",
      content: `SPEAK: ${decision.message}`,
      messageId: result.messageId,
    });

    // Also log to journal for context in future ticks
    await appendLog("journal.jsonl", {
      timestamp,
      type: "perch_message",
      content: `Bud (perch): ${decision.message}`,
    });
  } else {
    console.error(`[perch] Failed to send message: ${result.error}`);
    await appendLog("events.jsonl", {
      timestamp,
      type: "perch_error",
      content: result.error ?? "Unknown error",
    });
  }
}

main()
  .then(() => {
    console.log("[perch] Tick complete");
    process.exit(0);
  })
  .catch((error) => {
    console.error("[perch] Fatal error:", error);
    process.exit(1);
  });
```

**Step 2: Add perch script to package.json**

Modify `package.json` scripts section:

```json
{
  "scripts": {
    "dev": "bun run --watch src/bot.ts",
    "start": "bun run src/bot.ts",
    "perch": "bun run src/perch.ts",
    "typecheck": "tsc --noEmit",
    "test": "bun test"
  }
}
```

**Step 3: Run typecheck**

Run: `bun run typecheck`
Expected: No errors

**Step 4: Commit**

```bash
git add src/perch.ts package.json
git commit -m "feat: add perch tick main script"
```

---

## Task 5: Add Dokku Cron Configuration

**Files:**
- Create: `cron.d/perch` (for Dokku cron plugin)
- Modify: `Dockerfile`

Configure Dokku to run perch ticks every 2 hours.

**Step 1: Create cron configuration**

Create `cron.d/perch`:

```
# Run perch tick every 2 hours
0 */2 * * * /app/run-perch.sh
```

**Step 2: Create the perch runner script**

Create `scripts/run-perch.sh`:

```bash
#!/bin/bash
cd /app
exec bun run src/perch.ts
```

**Step 3: Update Dockerfile**

Add to `Dockerfile` before the CMD line:

```dockerfile
# Copy cron configuration
COPY --chown=bud:bud cron.d ./cron.d
COPY --chown=bud:bud scripts/run-perch.sh ./run-perch.sh
RUN chmod +x ./run-perch.sh
```

**Step 4: Commit**

```bash
git add cron.d/perch scripts/run-perch.sh Dockerfile
git commit -m "feat: add Dokku cron configuration for perch ticks"
```

---

## Task 6: Run All Tests and Final Verification

**Step 1: Run full test suite**

Run: `bun test`
Expected: All tests pass

**Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: No errors

**Step 3: Test perch script locally (dry run)**

Run: `bun run perch`
Expected: Script runs, gathers context, makes decision, logs result

**Step 4: Commit any fixes**

```bash
git status
# If clean, nothing to commit
```

---

## Task 7: Deploy and Configure Dokku Cron

**Step 1: Push to Dokku**

```bash
git push dokku main
```

**Step 2: Install and configure Dokku cron plugin (manual steps for operator)**

If not already installed:
```bash
# On Dokku server
sudo dokku plugin:install https://github.com/dokku/dokku-cron.git
```

Set up the cron job:
```bash
# On Dokku server
dokku cron:add bud perch "0 */2 * * *" "bun run src/perch.ts"
```

**Step 3: Verify cron is configured**

```bash
dokku cron:list bud
```

Expected output shows perch job running every 2 hours.

---

## Summary

| Task | Description |
|------|-------------|
| 1 | Create Discord message sender utility |
| 2 | Create perch context gatherer |
| 3 | Create perch decision maker |
| 4 | Create perch main script |
| 5 | Add Dokku cron configuration |
| 6 | Run all tests and verify |
| 7 | Deploy and configure Dokku cron |

**Key files created:**
- `src/discord/sender.ts` - Send messages without full bot
- `src/perch/context.ts` - Gather context for perch tick
- `src/perch/decide.ts` - LLM decides whether to speak
- `src/perch.ts` - Main perch script entry point
- `cron.d/perch` - Dokku cron configuration
- `scripts/run-perch.sh` - Perch runner script

**Log files used:**
- `perch.jsonl` - Perch tick decisions (SILENT or SPEAK)
- `journal.jsonl` - Perch messages (for future context)
- `events.jsonl` - Perch errors

**Deferred:**
- Quiet hours implementation
- Memory tool access in perch ticks (can be added later if needed)
