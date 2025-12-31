# Autonomous Behavior Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform Bud from a reactive assistant to an autonomous agent that proactively works on goals within budget constraints, with proper reentrancy handling.

**Architecture:** State machine for coordination, yield-based preemption, cost tracking throughout execution, graceful handoffs.

**Tech Stack:** SQLite (existing), Claude Agent SDK with cost tracking, Berlin timezone handling

---

## Phase 1: State & Budget Infrastructure

### Task 1.1: Create State Module

**Files:**
- Create: `src/state.ts`
- Create: `tests/state.test.ts`

**Step 1: Write the test**

Create `tests/state.test.ts`:

```typescript
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import {
  getState,
  setState,
  requestPreempt,
  clearPreempt,
  shouldYield,
  type BudState
} from "../src/state";
import { initDatabase, closeDatabase } from "../src/memory/blocks";
import { rm } from "fs/promises";

const TEST_DB = "/tmp/bud-state-test/memory.db";

beforeEach(async () => {
  await rm("/tmp/bud-state-test", { recursive: true, force: true });
  initDatabase(TEST_DB);
});

afterEach(() => {
  closeDatabase();
});

describe("state", () => {
  test("getState returns idle state when not set", () => {
    const state = getState();
    expect(state.status).toBe("idle");
  });

  test("setState updates state", () => {
    setState({
      status: "working",
      current_task: "Test task",
      started_at: new Date().toISOString(),
      session_budget: 0.50,
      session_spent: 0
    });
    const state = getState();
    expect(state.status).toBe("working");
    expect(state.current_task).toBe("Test task");
  });

  test("requestPreempt sets preempt flag", () => {
    setState({ status: "working", current_task: "Task" });
    requestPreempt("User message");
    const state = getState();
    expect(state.preempt_requested).toBe(true);
    expect(state.preempt_reason).toBe("User message");
  });

  test("clearPreempt resets preempt flag", () => {
    requestPreempt("Test");
    clearPreempt();
    const state = getState();
    expect(state.preempt_requested).toBe(false);
  });

  test("shouldYield returns true when preempt requested", () => {
    setState({ status: "working", session_budget: 1.0, session_spent: 0 });
    requestPreempt("Interrupt");
    expect(shouldYield()).toBe(true);
  });

  test("shouldYield returns true when budget exceeded", () => {
    setState({ status: "working", session_budget: 0.50, session_spent: 0.60 });
    expect(shouldYield()).toBe(true);
  });

  test("shouldYield returns false when budget has room", () => {
    setState({ status: "working", session_budget: 1.0, session_spent: 0.30 });
    expect(shouldYield()).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/state.test.ts`
Expected: FAIL - module not found

**Step 3: Implement**

Create `src/state.ts`:

```typescript
import { getBlock, setBlock } from "./memory/blocks";

export interface BudState {
  status: "idle" | "working" | "wrapping_up";
  current_task: string | null;
  started_at: string | null;
  session_budget: number;
  session_spent: number;
  preempt_requested: boolean;
  preempt_reason: string | null;
}

const DEFAULT_STATE: BudState = {
  status: "idle",
  current_task: null,
  started_at: null,
  session_budget: 0,
  session_spent: 0,
  preempt_requested: false,
  preempt_reason: null,
};

export function getState(): BudState {
  const raw = getBlock("bud_state");
  if (!raw) return { ...DEFAULT_STATE };
  try {
    return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function setState(updates: Partial<BudState>): void {
  const current = getState();
  const newState = { ...current, ...updates };
  setBlock("bud_state", JSON.stringify(newState), 4);
}

export function requestPreempt(reason: string): void {
  setState({ preempt_requested: true, preempt_reason: reason });
}

export function clearPreempt(): void {
  setState({ preempt_requested: false, preempt_reason: null });
}

export function shouldYield(): boolean {
  const state = getState();

  // Yield if preemption requested
  if (state.preempt_requested) return true;

  // Yield if budget exceeded (allowing 15% buffer for wrap-up)
  if (state.session_budget > 0) {
    const budgetWithBuffer = state.session_budget * 1.15;
    if (state.session_spent >= budgetWithBuffer) return true;
  }

  return false;
}

export function isWrappingUp(): boolean {
  const state = getState();
  if (state.session_budget <= 0) return false;
  // Wrapping up when past 85% of budget
  return state.session_spent >= state.session_budget * 0.85;
}
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/state.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/state.ts tests/state.test.ts
git commit -m "feat: add state module for coordination and yield control"
```

---

### Task 1.2: Create Budget Module

**Files:**
- Create: `src/budget.ts`
- Create: `tests/budget.test.ts`

**Step 1: Write the test**

Create `tests/budget.test.ts`:

```typescript
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import {
  getDailyCap,
  setDailyCap,
  getDailySpent,
  trackCost,
  getRemainingBudget,
  checkDailyReset,
} from "../src/budget";
import { initDatabase, closeDatabase, setBlock } from "../src/memory/blocks";
import { rm } from "fs/promises";

const TEST_DB = "/tmp/bud-budget-test/memory.db";

beforeEach(async () => {
  await rm("/tmp/bud-budget-test", { recursive: true, force: true });
  initDatabase(TEST_DB);
});

afterEach(() => {
  closeDatabase();
});

describe("budget", () => {
  test("getDailyCap returns 0 when not set", () => {
    expect(getDailyCap()).toBe(0);
  });

  test("setDailyCap stores value", () => {
    setDailyCap(5.00);
    expect(getDailyCap()).toBe(5.00);
  });

  test("getDailySpent returns 0 when not set", () => {
    expect(getDailySpent()).toBe(0);
  });

  test("trackCost increments daily spent", () => {
    trackCost(0.25);
    expect(getDailySpent()).toBe(0.25);
    trackCost(0.10);
    expect(getDailySpent()).toBe(0.35);
  });

  test("getRemainingBudget calculates correctly", () => {
    setDailyCap(5.00);
    trackCost(1.50);
    expect(getRemainingBudget()).toBe(3.50);
  });

  test("checkDailyReset resets at midnight Berlin", () => {
    setDailyCap(5.00);
    trackCost(2.00);

    // Simulate yesterday's date
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    setBlock("budget_last_reset", yesterday.toISOString().split("T")[0], 4);

    checkDailyReset("Europe/Berlin");
    expect(getDailySpent()).toBe(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/budget.test.ts`
Expected: FAIL - module not found

**Step 3: Implement**

Create `src/budget.ts`:

```typescript
import { getBlock, setBlock } from "./memory/blocks";

export function getDailyCap(): number {
  const raw = getBlock("budget_daily_cap");
  return raw ? parseFloat(raw) : 0;
}

export function setDailyCap(amount: number): void {
  setBlock("budget_daily_cap", amount.toFixed(2), 4);
}

export function getDailySpent(): number {
  const raw = getBlock("budget_daily_spent");
  return raw ? parseFloat(raw) : 0;
}

export function setDailySpent(amount: number): void {
  setBlock("budget_daily_spent", amount.toFixed(4), 4);
}

export function trackCost(amount: number): void {
  const current = getDailySpent();
  setDailySpent(current + amount);
}

export function getRemainingBudget(): number {
  return getDailyCap() - getDailySpent();
}

export function getLastResetDate(): string | null {
  return getBlock("budget_last_reset");
}

export function setLastResetDate(date: string): void {
  setBlock("budget_last_reset", date, 4);
}

export function checkDailyReset(timezone: string = "Europe/Berlin"): boolean {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const todayInTz = formatter.format(now); // YYYY-MM-DD

  const lastReset = getLastResetDate();

  if (lastReset !== todayInTz) {
    // New day in Berlin - reset
    setDailySpent(0);
    setLastResetDate(todayInTz);
    return true;
  }

  return false;
}

export function formatBudgetStatus(): string {
  const cap = getDailyCap();
  const spent = getDailySpent();
  const remaining = getRemainingBudget();
  return `$${spent.toFixed(2)} / $${cap.toFixed(2)} (${remaining.toFixed(2)} remaining)`;
}
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/budget.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/budget.ts tests/budget.test.ts
git commit -m "feat: add budget module for daily cost tracking"
```

---

## Phase 2: Yield-Aware Agent

### Task 2.1: Create Execution Module

**Files:**
- Create: `src/execution.ts`

This module wraps the Claude Agent SDK with yield checking and cost tracking.

**Step 1: Implement**

Create `src/execution.ts`:

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";
import { getState, setState, shouldYield, isWrappingUp } from "./state";
import { trackCost, getRemainingBudget, formatBudgetStatus } from "./budget";
import { appendJournal } from "./memory/journal";

export interface ExecutionResult {
  response: string;
  toolsUsed: string[];
  totalCost: number;
  yielded: boolean;
  yieldReason: string | null;
}

export interface ExecutionOptions {
  prompt: string;
  mcpServers: Record<string, unknown>;
  allowedTools: string[];
  sessionBudget: number;
}

export async function executeWithYield(options: ExecutionOptions): Promise<ExecutionResult> {
  const { prompt, mcpServers, allowedTools, sessionBudget } = options;

  // Initialize session tracking
  setState({
    session_budget: sessionBudget,
    session_spent: 0
  });

  const toolsUsed: string[] = [];
  let responseText = "";
  let totalCost = 0;
  let yielded = false;
  let yieldReason: string | null = null;

  try {
    const result = query({
      prompt,
      options: {
        permissionMode: "bypassPermissions",
        mcpServers,
        allowedTools,
        pathToClaudeCodeExecutable: "/usr/bin/claude",
      },
    });

    for await (const message of result) {
      // Track cost from result messages
      if (message.type === "result" && "total_cost_usd" in message) {
        const cost = message.total_cost_usd as number;
        totalCost = cost;
        trackCost(cost);
        setState({ session_spent: cost });
      }

      // Process assistant messages
      if (message.type === "assistant" && "message" in message) {
        for (const block of message.message.content) {
          if (block.type === "text") {
            responseText += block.text;
          } else if (block.type === "tool_use") {
            // Check yield before tool execution
            if (shouldYield()) {
              yielded = true;
              const state = getState();
              yieldReason = state.preempt_requested
                ? state.preempt_reason
                : "Budget limit reached";

              await appendJournal({
                type: "yield",
                reason: yieldReason,
                budget_status: formatBudgetStatus(),
                tools_used: toolsUsed,
              });

              break;
            }

            // Check if wrapping up (past 85% budget)
            if (isWrappingUp()) {
              // Add wrap-up hint to context (agent will see this)
              await appendJournal({
                type: "budget_warning",
                message: "Approaching budget limit, please wrap up",
                budget_status: formatBudgetStatus(),
              });
            }

            toolsUsed.push(block.name);

            // Log tool use
            await appendJournal({
              type: "tool_use",
              tool: block.name,
            });
          }
        }

        if (yielded) break;
      } else if (message.type === "result" && "result" in message) {
        if (message.result) {
          responseText = message.result;
        }
      }
    }
  } catch (error) {
    await appendJournal({
      type: "execution_error",
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  return {
    response: responseText,
    toolsUsed,
    totalCost,
    yielded,
    yieldReason,
  };
}
```

**Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/execution.ts
git commit -m "feat: add yield-aware execution wrapper"
```

---

### Task 2.2: Update Agent to Use Execution Module

**Files:**
- Modify: `src/agent.ts`

**Step 1: Update agent.ts**

Replace the direct `query()` call with `executeWithYield()`:

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
import { createSkillToolsServer, SKILL_TOOL_NAMES } from "./tools/skills";
import { parseReposJson } from "./integrations/github";
import { listSkillNames } from "./skills";
import { executeWithYield } from "./execution";
import { getState, setState, clearPreempt } from "./state";
import { getRemainingBudget, checkDailyReset } from "./budget";

export interface AgentContext {
  userId: string;
  username: string;
  channelId: string;
  discordClient: Client;
}

export interface AgentResult {
  response: string;
  toolsUsed: string[];
  yielded?: boolean;
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
  context: AgentContext,
  sessionBudget?: number
): Promise<AgentResult> {
  try {
    ensureInitialized();
    checkDailyReset("Europe/Berlin");

    // Clear any previous preemption
    clearPreempt();

    // Set working state
    setState({
      status: "working",
      current_task: `Discord: ${userMessage.slice(0, 50)}`,
      started_at: new Date().toISOString(),
    });

    // Log trigger to journal
    await appendJournal({
      type: "trigger",
      trigger_type: "message",
      from: context.username,
      preview: userMessage.slice(0, 100),
    });

    // Load prompt context from local memory
    const promptContext = await loadPromptContext();

    // Create MCP servers
    const memoryServer = createBlockToolsServer();
    const calendarServer = createCalendarToolsServer();
    const skillsServer = createSkillToolsServer();

    // Load GitHub repos from working memory
    const reposJson = promptContext.working.github_repos || "[]";
    const githubRepos = parseReposJson(reposJson);
    const githubServer = createGitHubToolsServer(githubRepos);

    // Create image tools server
    const imageServer = createImageToolsServer(context.discordClient, context.channelId);

    const prompt = buildFullPrompt(promptContext, {
      type: "message",
      content: userMessage,
      from: context.username,
    });

    // Use session budget or remaining daily budget
    const budget = sessionBudget ?? Math.min(getRemainingBudget(), 1.00);

    const result = await executeWithYield({
      prompt,
      mcpServers: {
        memory: memoryServer,
        calendar: calendarServer,
        github: githubServer,
        images: imageServer,
        skills: skillsServer,
      },
      allowedTools: [
        ...BLOCK_TOOL_NAMES,
        ...CALENDAR_TOOL_NAMES,
        ...GITHUB_TOOL_NAMES,
        ...IMAGE_TOOL_NAMES,
        ...SKILL_TOOL_NAMES,
      ],
      sessionBudget: budget,
    });

    // Log response sent
    await appendJournal({
      type: "message_sent",
      to: context.username,
      preview: result.response.slice(0, 100),
      tools_used: result.toolsUsed,
      cost: result.totalCost,
      yielded: result.yielded,
    });

    // Reset state
    setState({ status: "idle", current_task: null });

    return {
      response: result.response || "I apologize, but I couldn't generate a response.",
      toolsUsed: result.toolsUsed,
      yielded: result.yielded,
    };
  } catch (error) {
    console.error("[agent] Error:", error);
    setState({ status: "idle", current_task: null });

    await appendJournal({
      type: "error",
      error: error instanceof Error ? error.message : String(error),
      context: "invokeAgent",
    });

    return {
      response: "I encountered an error processing your request. Please try again.",
      toolsUsed: [],
    };
  }
}
```

**Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/agent.ts
git commit -m "refactor: use yield-aware execution in agent"
```

---

## Phase 3: Updated Bot with Preemption

### Task 3.1: Add Preemption Handling to Bot

**Files:**
- Modify: `src/bot.ts`

**Step 1: Update bot.ts**

Add preemption handling when Bud is already working:

```typescript
import { Client, Events, GatewayIntentBits, Message } from "discord.js";
import { config, validateConfig, getDbPath, getJournalPath } from "./config";
import { invokeAgent } from "./agent";
import { appendLog } from "./memory/logs";
import { initDatabase } from "./memory/blocks";
import { initJournal } from "./memory/journal";
import { getState, requestPreempt, clearPreempt } from "./state";
import { checkDailyReset } from "./budget";

validateConfig();

// Initialize memory at startup
initDatabase(getDbPath());
initJournal(getJournalPath());
checkDailyReset("Europe/Berlin");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Track pending messages when preempting
const pendingMessages: Message[] = [];

client.once(Events.ClientReady, (c) => {
  console.log(`[bud] Ready! Logged in as ${c.user.tag}`);
});

client.on(Events.MessageCreate, async (message: Message) => {
  // Ignore bot messages and messages outside our channel
  if (message.author.bot) return;
  if (message.channelId !== config.discord.channelId) return;

  const timestamp = new Date().toISOString();
  console.log(`[bud] ${timestamp} Message from ${message.author.username}: ${message.content}`);

  // Check if Bud is currently working
  const state = getState();
  if (state.status === "working") {
    console.log(`[bud] Currently working on: ${state.current_task}, requesting preempt`);

    // Send "please wait" message
    await message.reply("One moment, I'm finishing something up...");

    // Request preemption
    requestPreempt(`Discord message from ${message.author.username}`);

    // Queue this message
    pendingMessages.push(message);

    // Wait for state to become idle (poll every 2 seconds, timeout after 60s)
    const maxWait = 60000;
    const pollInterval = 2000;
    let waited = 0;

    while (waited < maxWait) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      waited += pollInterval;

      const currentState = getState();
      if (currentState.status === "idle") {
        console.log(`[bud] Preemption complete after ${waited}ms`);
        break;
      }
    }

    // Remove from pending
    const idx = pendingMessages.indexOf(message);
    if (idx > -1) pendingMessages.splice(idx, 1);

    // Clear preempt flag
    clearPreempt();
  }

  try {
    // Show typing indicator
    if ("sendTyping" in message.channel) {
      await message.channel.sendTyping();
    }

    const result = await invokeAgent(message.content, {
      userId: message.author.id,
      username: message.author.username,
      channelId: message.channelId,
      discordClient: client,
    });

    if (result.response) {
      await message.reply(result.response);
    }

    // Log the interaction (non-fatal if it fails)
    try {
      await appendLog("journal.jsonl", {
        timestamp,
        type: "interaction",
        content: `User: ${message.content}\nBud: ${result.response}`,
        userId: message.author.id,
        toolsUsed: result.toolsUsed,
      });
    } catch (logError) {
      console.error("[bud] Failed to log interaction:", logError);
    }
  } catch (error) {
    console.error("[bud] Error processing message:", error);

    try {
      await appendLog("events.jsonl", {
        timestamp,
        type: "error",
        content: error instanceof Error ? error.message : String(error),
      });
    } catch (logError) {
      console.error("[bud] Failed to log error:", logError);
    }

    await message.reply("Sorry, I encountered an error processing your message.");
  }
});

client.login(config.discord.token);
```

**Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/bot.ts
git commit -m "feat: add preemption handling for Discord messages"
```

---

## Phase 4: Autonomous Perch

### Task 4.1: Rewrite Perch for Autonomous Work

**Files:**
- Modify: `src/perch.ts`
- Create: `src/perch/work.ts`

**Step 1: Create work selection module**

Create `src/perch/work.ts`:

```typescript
import { getBlock } from "../memory/blocks";
import { getRecentJournal } from "../memory/journal";
import { getRemainingBudget } from "../budget";

export interface WorkItem {
  type: "scheduled_task" | "goal" | "maintenance";
  id: string;
  description: string;
  context: string;
  estimatedBudget: number;
}

export async function selectWork(scheduledTasks: Array<{ id: string; description: string; context?: string }>): Promise<WorkItem | null> {
  const remaining = getRemainingBudget();

  if (remaining <= 0) {
    return null; // No budget
  }

  // Priority 1: Scheduled tasks that are due
  if (scheduledTasks.length > 0) {
    const task = scheduledTasks[0];
    return {
      type: "scheduled_task",
      id: task.id,
      description: task.description,
      context: task.context || "",
      estimatedBudget: Math.min(0.50, remaining), // Default estimate
    };
  }

  // Priority 2: Active goals
  const goals = getBlock("goals");
  if (goals && goals !== "(No active goals.)") {
    return {
      type: "goal",
      id: "goal-work",
      description: "Work on active goals",
      context: goals,
      estimatedBudget: Math.min(1.00, remaining),
    };
  }

  // Priority 3: Maintenance (sync state, review budget estimates, etc.)
  const lastSync = await getLastSyncTime();
  const hoursSinceSync = lastSync
    ? (Date.now() - new Date(lastSync).getTime()) / (1000 * 60 * 60)
    : 999;

  if (hoursSinceSync > 24) {
    return {
      type: "maintenance",
      id: "sync-state",
      description: "Sync state to GitHub",
      context: "Daily backup",
      estimatedBudget: Math.min(0.10, remaining),
    };
  }

  return null; // Nothing to do
}

async function getLastSyncTime(): Promise<string | null> {
  const journal = await getRecentJournal(100);
  const syncEntry = journal.find(e => e.type === "sync" || (e.type === "tool_use" && e.tool === "sync-state"));
  return syncEntry?.ts || null;
}
```

**Step 2: Rewrite perch.ts**

```typescript
#!/usr/bin/env bun
import { config, validateConfig, getDbPath, getJournalPath } from "./config";
import { initDatabase } from "./memory/blocks";
import { initJournal, appendJournal } from "./memory/journal";
import { gatherPerchContext } from "./perch/context";
import { selectWork, type WorkItem } from "./perch/work";
import { sendMessage } from "./discord/sender";
import { appendLog } from "./memory/logs";
import { markTaskComplete } from "./tools/tasks";
import { getState, setState, shouldYield } from "./state";
import { checkDailyReset, getRemainingBudget, formatBudgetStatus } from "./budget";
import { executeWithYield } from "./execution";
import { buildFullPrompt, type PromptContext } from "./prompt";
import { getBlocksByLayer } from "./memory/blocks";
import { getRecentJournal } from "./memory/journal";
import { listSkillNames } from "./skills";
import { createBlockToolsServer, BLOCK_TOOL_NAMES } from "./tools/blocks";
import { createCalendarToolsServer, CALENDAR_TOOL_NAMES } from "./tools/calendar";
import { createGitHubToolsServer, GITHUB_TOOL_NAMES } from "./tools/github";
import { createSkillToolsServer, SKILL_TOOL_NAMES } from "./tools/skills";
import { parseReposJson } from "./integrations/github";

async function loadPromptContext(): Promise<PromptContext> {
  const identity = getBlocksByLayer(2);
  const semantic = getBlocksByLayer(3);
  const working = getBlocksByLayer(4);
  const journal = await getRecentJournal(40);
  const skills = await listSkillNames(config.skills.path);
  return { identity, semantic, working, journal, skills };
}

async function executeWork(work: WorkItem): Promise<void> {
  console.log(`[perch] Executing: ${work.description} (budget: $${work.estimatedBudget.toFixed(2)})`);

  setState({
    status: "working",
    current_task: work.description,
    started_at: new Date().toISOString(),
    session_budget: work.estimatedBudget,
    session_spent: 0,
  });

  await appendJournal({
    type: "work_started",
    work_type: work.type,
    description: work.description,
    budget: work.estimatedBudget,
  });

  const promptContext = await loadPromptContext();

  // Build work-specific prompt
  const workPrompt = `You are Bud, doing autonomous work during a perch tick.

## Current Task
${work.description}

## Context
${work.context}

## Budget
You have $${work.estimatedBudget.toFixed(2)} for this task.
${formatBudgetStatus()}

## Instructions
1. Complete the task described above
2. If you're approaching budget limit, wrap up gracefully
3. Update relevant memory blocks with your progress
4. Report what you accomplished

Begin working on the task now.`;

  const fullPrompt = buildFullPrompt(promptContext, {
    type: "perch",
    content: workPrompt,
  });

  // Create MCP servers
  const memoryServer = createBlockToolsServer();
  const calendarServer = createCalendarToolsServer();
  const skillsServer = createSkillToolsServer();
  const reposJson = promptContext.working.github_repos || "[]";
  const githubRepos = parseReposJson(reposJson);
  const githubServer = createGitHubToolsServer(githubRepos);

  try {
    const result = await executeWithYield({
      prompt: fullPrompt,
      mcpServers: {
        memory: memoryServer,
        calendar: calendarServer,
        github: githubServer,
        skills: skillsServer,
      },
      allowedTools: [
        ...BLOCK_TOOL_NAMES,
        ...CALENDAR_TOOL_NAMES,
        ...GITHUB_TOOL_NAMES,
        ...SKILL_TOOL_NAMES,
      ],
      sessionBudget: work.estimatedBudget,
    });

    // Log completion
    await appendJournal({
      type: "work_completed",
      work_type: work.type,
      description: work.description,
      cost: result.totalCost,
      yielded: result.yielded,
      yield_reason: result.yieldReason,
    });

    // Send Discord update if there's something to report
    if (result.response && result.response.length > 0) {
      await sendMessage({
        token: config.discord.token,
        channelId: config.discord.channelId,
        content: result.response.slice(0, 2000), // Discord limit
      });
    }

  } catch (error) {
    console.error("[perch] Work execution error:", error);
    await appendJournal({
      type: "work_error",
      work_type: work.type,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  setState({ status: "idle", current_task: null });
}

async function main() {
  const timestamp = new Date().toISOString();
  console.log(`[perch] Starting tick at ${timestamp}`);

  try {
    validateConfig();
  } catch (error) {
    console.error("[perch] Config validation failed:", error);
    process.exit(1);
  }

  // Initialize
  initDatabase(getDbPath());
  initJournal(getJournalPath());
  checkDailyReset("Europe/Berlin");

  // Check if already working (another process or stuck state)
  const state = getState();
  if (state.status === "working") {
    // Check if it's been too long (>30 min = probably stuck)
    const startedAt = state.started_at ? new Date(state.started_at) : new Date();
    const minutesWorking = (Date.now() - startedAt.getTime()) / (1000 * 60);

    if (minutesWorking > 30) {
      console.log("[perch] Detected stuck state, resetting");
      setState({ status: "idle", current_task: null });
    } else {
      console.log(`[perch] Already working on: ${state.current_task}, skipping`);
      return;
    }
  }

  // Check budget
  const remaining = getRemainingBudget();
  if (remaining <= 0) {
    console.log("[perch] No budget remaining, skipping");
    await appendLog("perch.jsonl", {
      timestamp,
      type: "perch_skip",
      reason: "no_budget",
      budget_status: formatBudgetStatus(),
    });
    return;
  }

  // Gather context
  console.log("[perch] Gathering context...");
  const context = await gatherPerchContext();

  // Select work
  const work = await selectWork(context.dueTasks);

  if (!work) {
    console.log("[perch] No work to do");
    await appendLog("perch.jsonl", {
      timestamp,
      type: "perch_idle",
      budget_status: formatBudgetStatus(),
    });
    return;
  }

  // Execute work
  await executeWork(work);

  // Mark scheduled tasks complete
  if (work.type === "scheduled_task") {
    markTaskComplete(work.id);
  }

  console.log("[perch] Tick complete");
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("[perch] Fatal error:", error);
    process.exit(1);
  });
```

**Step 3: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add src/perch.ts src/perch/work.ts
git commit -m "feat: rewrite perch for autonomous work with budget awareness"
```

---

## Phase 5: Initialize Budget

### Task 5.1: Update Init Script

**Files:**
- Modify: `scripts/init-memory.ts`

**Step 1: Add budget blocks to default blocks**

Add to DEFAULT_BLOCKS:
```typescript
// Budget
budget_daily_cap: "5.00",
budget_daily_spent: "0.00",
budget_last_reset: new Date().toISOString().split("T")[0],

// State
bud_state: JSON.stringify({
  status: "idle",
  current_task: null,
  started_at: null,
  session_budget: 0,
  session_spent: 0,
  preempt_requested: false,
  preempt_reason: null,
}),
```

**Step 2: Commit**

```bash
git add scripts/init-memory.ts
git commit -m "feat: add budget and state blocks to init script"
```

---

## Phase 6: Testing & Deployment

### Task 6.1: Run All Tests

Run: `bun test`
Expected: All tests pass

### Task 6.2: Deploy

```bash
git push origin main
git push dokku main
```

### Task 6.3: Initialize Budget on Server

```bash
ssh dokku@sandmill.org run bud bun scripts/init-memory.ts
```

---

## Summary

After implementation:

1. **State machine** tracks Bud's status (idle/working/wrapping_up)
2. **Budget system** tracks daily cap, spent, with Berlin timezone reset
3. **Yield-aware execution** checks for preemption before each tool call
4. **Bot preemption** sends "please wait" and interrupts work for user messages
5. **Autonomous perch** selects work, estimates budget, executes with full agent capabilities
6. **Cost tracking** throughout execution, logged to journal

**Bud can now:**
- Work autonomously during perch ticks
- Respond to user messages with preemption
- Track and respect budget limits
- Gracefully wrap up when budget runs low
- Report progress via Discord
