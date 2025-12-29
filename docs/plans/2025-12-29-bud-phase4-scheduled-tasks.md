# Bud Phase 4: Scheduled Tasks Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable Bud to self-schedule future tasks and reminders that trigger at specific times.

**Architecture:** Add a `scheduled_tasks` Letta block storing task objects with due times. Perch runs every 5 minutes with a "fast path" that checks for due tasks without calling the LLM. Full perch ticks (every 2 hours) continue as before. New MCP tools let Bud create/cancel scheduled tasks.

**Tech Stack:** Letta SDK, Bun, TypeScript, Dokku cron

**Design Decision:** Tasks are stored in Letta (not a database) for simplicity. The 5-minute granularity balances responsiveness with resource usage.

---

## Task 1: Add Scheduled Tasks Letta Block

**Files:**
- Modify: `scripts/setup-letta-agent.ts`

This adds the `scheduled_tasks` block to the Letta agent. For existing agents, we'll add it via API.

**Step 1: Update setup script with new block**

Add to `INITIAL_BLOCKS` array in `scripts/setup-letta-agent.ts`:

```typescript
{
  label: "scheduled_tasks",
  value: "[]",
  limit: 10000,
},
```

**Step 2: Add block to existing agent via curl**

Run manually (not in script):
```bash
# Get the agent's block list first to check if it exists
curl -s -X GET "http://172.17.0.1:8283/v1/agents/agent-66876a60-adb0-4d2e-985a-6cbe4b967b90/memory/block" \
  -H "Authorization: Bearer <LETTA_API_KEY>"

# Create the block if it doesn't exist
curl -X POST "http://172.17.0.1:8283/v1/agents/agent-66876a60-adb0-4d2e-985a-6cbe4b967b90/memory/block" \
  -H "Authorization: Bearer <LETTA_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"label": "scheduled_tasks", "value": "[]", "limit": 10000}'
```

**Step 3: Commit**

```bash
git add scripts/setup-letta-agent.ts
git commit -m "feat: add scheduled_tasks block to Letta agent setup"
```

---

## Task 2: Create Task Types and Utilities

**Files:**
- Create: `src/perch/tasks.ts`
- Create: `tests/perch/tasks.test.ts`

Define task types and utility functions for checking due tasks.

**Step 1: Write the failing test**

Create `tests/perch/tasks.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import {
  type ScheduledTask,
  parseTasksJson,
  getDueTasks,
  serializeTasksJson,
  createTask,
} from "../../src/perch/tasks";

describe("parseTasksJson", () => {
  test("parses valid JSON array", () => {
    const json = '[{"id":"1","description":"Test","dueAt":"2025-12-29T10:00:00Z"}]';
    const tasks = parseTasksJson(json);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe("1");
  });

  test("returns empty array for invalid JSON", () => {
    const tasks = parseTasksJson("not json");
    expect(tasks).toEqual([]);
  });

  test("returns empty array for empty string", () => {
    const tasks = parseTasksJson("");
    expect(tasks).toEqual([]);
  });
});

describe("getDueTasks", () => {
  test("returns tasks that are due", () => {
    const now = new Date("2025-12-29T10:30:00Z");
    const tasks: ScheduledTask[] = [
      { id: "1", description: "Due", dueAt: "2025-12-29T10:00:00Z" },
      { id: "2", description: "Not due", dueAt: "2025-12-29T11:00:00Z" },
    ];
    const due = getDueTasks(tasks, now);
    expect(due).toHaveLength(1);
    expect(due[0].id).toBe("1");
  });

  test("returns empty array when nothing due", () => {
    const now = new Date("2025-12-29T09:00:00Z");
    const tasks: ScheduledTask[] = [
      { id: "1", description: "Later", dueAt: "2025-12-29T10:00:00Z" },
    ];
    const due = getDueTasks(tasks, now);
    expect(due).toEqual([]);
  });
});

describe("createTask", () => {
  test("creates task with absolute time", () => {
    const task = createTask("Test reminder", "2025-12-29T15:00:00Z");
    expect(task.description).toBe("Test reminder");
    expect(task.dueAt).toBe("2025-12-29T15:00:00Z");
    expect(task.id).toBeDefined();
  });

  test("creates task with relative time", () => {
    const now = new Date("2025-12-29T10:00:00Z");
    const task = createTask("In 30 minutes", "30m", undefined, now);
    expect(task.dueAt).toBe("2025-12-29T10:30:00Z");
  });

  test("creates task with hours relative time", () => {
    const now = new Date("2025-12-29T10:00:00Z");
    const task = createTask("In 2 hours", "2h", undefined, now);
    expect(task.dueAt).toBe("2025-12-29T12:00:00Z");
  });

  test("creates recurring task", () => {
    const task = createTask("Weekly check", "2025-12-29T10:00:00Z", "weekly");
    expect(task.recurring).toBe("weekly");
  });
});

describe("serializeTasksJson", () => {
  test("serializes tasks to JSON", () => {
    const tasks: ScheduledTask[] = [
      { id: "1", description: "Test", dueAt: "2025-12-29T10:00:00Z" },
    ];
    const json = serializeTasksJson(tasks);
    expect(json).toBe('[{"id":"1","description":"Test","dueAt":"2025-12-29T10:00:00Z"}]');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/perch/tasks.test.ts`
Expected: FAIL - module not found

**Step 3: Implement task utilities**

Create `src/perch/tasks.ts`:

```typescript
import { randomUUID } from "crypto";

export interface ScheduledTask {
  id: string;
  description: string;
  dueAt: string; // ISO 8601
  recurring?: "daily" | "weekly" | "monthly";
  context?: string; // Additional context for the LLM
}

export function parseTasksJson(json: string): ScheduledTask[] {
  if (!json || json.trim() === "") {
    return [];
  }
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed as ScheduledTask[];
  } catch {
    return [];
  }
}

export function serializeTasksJson(tasks: ScheduledTask[]): string {
  return JSON.stringify(tasks);
}

export function getDueTasks(tasks: ScheduledTask[], now: Date = new Date()): ScheduledTask[] {
  return tasks.filter((task) => {
    const dueTime = new Date(task.dueAt);
    return dueTime <= now;
  });
}

export function createTask(
  description: string,
  dueAt: string,
  recurring?: "daily" | "weekly" | "monthly",
  now: Date = new Date()
): ScheduledTask {
  let resolvedDueAt = dueAt;

  // Handle relative times like "30m", "2h", "1d"
  const relativeMatch = dueAt.match(/^(\d+)(m|h|d)$/);
  if (relativeMatch) {
    const amount = parseInt(relativeMatch[1], 10);
    const unit = relativeMatch[2];
    const ms =
      unit === "m" ? amount * 60 * 1000 :
      unit === "h" ? amount * 60 * 60 * 1000 :
      amount * 24 * 60 * 60 * 1000;
    resolvedDueAt = new Date(now.getTime() + ms).toISOString();
  }

  return {
    id: randomUUID(),
    description,
    dueAt: resolvedDueAt,
    recurring,
  };
}

export function removeTask(tasks: ScheduledTask[], taskId: string): ScheduledTask[] {
  return tasks.filter((t) => t.id !== taskId);
}

export function advanceRecurringTask(task: ScheduledTask): ScheduledTask | null {
  if (!task.recurring) {
    return null;
  }

  const dueDate = new Date(task.dueAt);
  let nextDue: Date;

  switch (task.recurring) {
    case "daily":
      nextDue = new Date(dueDate.getTime() + 24 * 60 * 60 * 1000);
      break;
    case "weekly":
      nextDue = new Date(dueDate.getTime() + 7 * 24 * 60 * 60 * 1000);
      break;
    case "monthly":
      nextDue = new Date(dueDate);
      nextDue.setMonth(nextDue.getMonth() + 1);
      break;
  }

  return {
    ...task,
    dueAt: nextDue.toISOString(),
  };
}
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/perch/tasks.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/perch/tasks.ts tests/perch/tasks.test.ts
git commit -m "feat: add scheduled task types and utilities"
```

---

## Task 3: Create Task Scheduling MCP Tools

**Files:**
- Create: `src/tools/tasks.ts`
- Create: `tests/tools/tasks.test.ts`

Add MCP tools for Bud to schedule, list, and cancel tasks.

**Step 1: Write the failing test**

Create `tests/tools/tasks.test.ts`:

```typescript
import { describe, expect, test, mock, beforeEach } from "bun:test";

// Mock Letta client
const mockGetMemoryBlock = mock(() => Promise.resolve("[]"));
const mockSetMemoryBlock = mock(() => Promise.resolve());

mock.module("../../src/memory/letta", () => ({
  getMemoryBlock: mockGetMemoryBlock,
  setMemoryBlock: mockSetMemoryBlock,
  createLettaClient: () => ({}),
}));

const { scheduleTask, cancelTask, listScheduledTasks } = await import(
  "../../src/tools/tasks"
);

describe("scheduleTask", () => {
  beforeEach(() => {
    mockGetMemoryBlock.mockClear();
    mockSetMemoryBlock.mockClear();
    mockGetMemoryBlock.mockResolvedValue("[]");
  });

  test("adds a new task to empty list", async () => {
    const result = await scheduleTask(
      {} as any,
      "agent-123",
      "Remind me to check deploy",
      "30m"
    );

    expect(result.success).toBe(true);
    expect(result.task?.description).toBe("Remind me to check deploy");
    expect(mockSetMemoryBlock).toHaveBeenCalled();
  });

  test("adds task to existing list", async () => {
    mockGetMemoryBlock.mockResolvedValue(
      '[{"id":"existing","description":"Old task","dueAt":"2025-12-29T10:00:00Z"}]'
    );

    const result = await scheduleTask(
      {} as any,
      "agent-123",
      "New task",
      "1h"
    );

    expect(result.success).toBe(true);
    const setCall = mockSetMemoryBlock.mock.calls[0];
    const savedTasks = JSON.parse(setCall[3]);
    expect(savedTasks).toHaveLength(2);
  });
});

describe("cancelTask", () => {
  beforeEach(() => {
    mockGetMemoryBlock.mockClear();
    mockSetMemoryBlock.mockClear();
  });

  test("removes task by id", async () => {
    mockGetMemoryBlock.mockResolvedValue(
      '[{"id":"task-1","description":"Task 1","dueAt":"2025-12-29T10:00:00Z"}]'
    );

    const result = await cancelTask({} as any, "agent-123", "task-1");

    expect(result.success).toBe(true);
    const setCall = mockSetMemoryBlock.mock.calls[0];
    const savedTasks = JSON.parse(setCall[3]);
    expect(savedTasks).toHaveLength(0);
  });

  test("returns not found for missing task", async () => {
    mockGetMemoryBlock.mockResolvedValue("[]");

    const result = await cancelTask({} as any, "agent-123", "nonexistent");

    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });
});

describe("listScheduledTasks", () => {
  test("returns all tasks", async () => {
    mockGetMemoryBlock.mockResolvedValue(
      '[{"id":"1","description":"Task 1","dueAt":"2025-12-29T10:00:00Z"}]'
    );

    const result = await listScheduledTasks({} as any, "agent-123");

    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].description).toBe("Task 1");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/tools/tasks.test.ts`
Expected: FAIL - module not found

**Step 3: Implement task tools**

Create `src/tools/tasks.ts`:

```typescript
import type Letta from "@letta-ai/letta-client";
import { getMemoryBlock, setMemoryBlock } from "../memory/letta";
import {
  type ScheduledTask,
  parseTasksJson,
  serializeTasksJson,
  createTask,
  removeTask,
} from "../perch/tasks";

const TASKS_BLOCK = "scheduled_tasks";

export interface ScheduleTaskResult {
  success: boolean;
  task?: ScheduledTask;
  error?: string;
}

export interface CancelTaskResult {
  success: boolean;
  error?: string;
}

export interface ListTasksResult {
  tasks: ScheduledTask[];
}

export async function scheduleTask(
  client: Letta,
  agentId: string,
  description: string,
  dueAt: string,
  recurring?: "daily" | "weekly" | "monthly",
  context?: string
): Promise<ScheduleTaskResult> {
  try {
    const json = await getMemoryBlock(client, agentId, TASKS_BLOCK);
    const tasks = parseTasksJson(json);

    const task = createTask(description, dueAt, recurring);
    if (context) {
      task.context = context;
    }

    tasks.push(task);
    await setMemoryBlock(client, agentId, TASKS_BLOCK, serializeTasksJson(tasks));

    return { success: true, task };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function cancelTask(
  client: Letta,
  agentId: string,
  taskId: string
): Promise<CancelTaskResult> {
  try {
    const json = await getMemoryBlock(client, agentId, TASKS_BLOCK);
    const tasks = parseTasksJson(json);

    const taskExists = tasks.some((t) => t.id === taskId);
    if (!taskExists) {
      return { success: false, error: `Task ${taskId} not found` };
    }

    const updated = removeTask(tasks, taskId);
    await setMemoryBlock(client, agentId, TASKS_BLOCK, serializeTasksJson(updated));

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function listScheduledTasks(
  client: Letta,
  agentId: string
): Promise<ListTasksResult> {
  const json = await getMemoryBlock(client, agentId, TASKS_BLOCK);
  const tasks = parseTasksJson(json);
  return { tasks };
}

export async function markTaskComplete(
  client: Letta,
  agentId: string,
  taskId: string
): Promise<CancelTaskResult> {
  // For non-recurring tasks, just remove them
  // For recurring tasks, advance to next occurrence
  try {
    const json = await getMemoryBlock(client, agentId, TASKS_BLOCK);
    const tasks = parseTasksJson(json);

    const taskIndex = tasks.findIndex((t) => t.id === taskId);
    if (taskIndex === -1) {
      return { success: false, error: `Task ${taskId} not found` };
    }

    const task = tasks[taskIndex];

    if (task.recurring) {
      // Advance to next occurrence
      const { advanceRecurringTask } = await import("../perch/tasks");
      const nextTask = advanceRecurringTask(task);
      if (nextTask) {
        tasks[taskIndex] = nextTask;
      }
    } else {
      // Remove one-off task
      tasks.splice(taskIndex, 1);
    }

    await setMemoryBlock(client, agentId, TASKS_BLOCK, serializeTasksJson(tasks));
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/tools/tasks.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/tools/tasks.ts tests/tools/tasks.test.ts
git commit -m "feat: add task scheduling tool functions"
```

---

## Task 4: Create Task Tools MCP Server

**Files:**
- Modify: `src/tools/memory.ts`

Add task scheduling tools to the existing MCP server.

**Step 1: Add task tools to memory.ts**

Add imports at top of `src/tools/memory.ts`:

```typescript
import {
  scheduleTask,
  cancelTask,
  listScheduledTasks,
  markTaskComplete,
} from "./tasks";
```

Add new tools inside `createMemoryToolsServer` function, after existing tools:

```typescript
const scheduleTaskTool = tool(
  "schedule_task",
  "Schedule a task or reminder for a future time. Use relative times like '30m', '2h', '1d' or ISO timestamps. For recurring tasks, specify 'daily', 'weekly', or 'monthly'.",
  {
    description: z.string().describe("What to do or remind about"),
    due_at: z.string().describe("When: relative ('30m', '2h', '1d') or ISO timestamp"),
    recurring: z.enum(["daily", "weekly", "monthly"]).optional().describe("Recurrence pattern"),
    context: z.string().optional().describe("Additional context for when the task triggers"),
  },
  async (args) => {
    const result = await scheduleTask(
      client,
      agentId,
      args.description,
      args.due_at,
      args.recurring,
      args.context
    );
    if (result.success) {
      return {
        content: [{
          type: "text" as const,
          text: `Scheduled: "${result.task?.description}" for ${result.task?.dueAt}${result.task?.recurring ? ` (${result.task.recurring})` : ""}`,
        }],
      };
    }
    return { content: [{ type: "text" as const, text: `Error: ${result.error}` }] };
  }
);

const cancelTaskTool = tool(
  "cancel_task",
  "Cancel a scheduled task by its ID",
  {
    task_id: z.string().describe("The task ID to cancel"),
  },
  async (args) => {
    const result = await cancelTask(client, agentId, args.task_id);
    if (result.success) {
      return { content: [{ type: "text" as const, text: "Task cancelled" }] };
    }
    return { content: [{ type: "text" as const, text: `Error: ${result.error}` }] };
  }
);

const listTasksTool = tool(
  "list_tasks",
  "List all scheduled tasks and reminders",
  {},
  async () => {
    const result = await listScheduledTasks(client, agentId);
    if (result.tasks.length === 0) {
      return { content: [{ type: "text" as const, text: "No scheduled tasks" }] };
    }
    const list = result.tasks
      .map((t) => `- [${t.id}] ${t.description} (due: ${t.dueAt}${t.recurring ? `, ${t.recurring}` : ""})`)
      .join("\n");
    return { content: [{ type: "text" as const, text: list }] };
  }
);
```

Update the `createSdkMcpServer` call to include new tools:

```typescript
return createSdkMcpServer({
  name: "letta-memory",
  version: "1.0.0",
  tools: [
    getMemoryTool,
    setMemoryTool,
    listMemoryTool,
    scheduleTaskTool,
    cancelTaskTool,
    listTasksTool,
  ],
});
```

Update `MEMORY_TOOL_NAMES` export:

```typescript
export const MEMORY_TOOL_NAMES = [
  "mcp__letta-memory__get_memory",
  "mcp__letta-memory__set_memory",
  "mcp__letta-memory__list_memory",
  "mcp__letta-memory__schedule_task",
  "mcp__letta-memory__cancel_task",
  "mcp__letta-memory__list_tasks",
];
```

**Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add src/tools/memory.ts
git commit -m "feat: add task scheduling MCP tools"
```

---

## Task 5: Update Perch Script with Fast Path

**Files:**
- Modify: `src/perch.ts`
- Modify: `src/perch/context.ts`

Add fast path that checks for due tasks without calling LLM.

**Step 1: Add getDueTasks to context module**

Add to `src/perch/context.ts` exports and imports:

```typescript
import { getMemoryBlock } from "../memory/letta";
import { parseTasksJson, getDueTasks, type ScheduledTask } from "./tasks";

// Add to PerchContext interface:
export interface PerchContext {
  currentTime: string;
  hourOfDay: number;
  dayOfWeek: string;
  memory: BudContext;
  recentInteractions: LogEntry[];
  hoursSinceLastInteraction: number | null;
  dueTasks: ScheduledTask[]; // NEW
}

// Add to gatherPerchContext function, after loading memory:
const tasksJson = await getMemoryBlock(options.lettaClient, options.agentId, "scheduled_tasks");
const allTasks = parseTasksJson(tasksJson);
const dueTasks = getDueTasks(allTasks, now);
```

Update return statement to include `dueTasks`.

**Step 2: Update perch.ts with fast path logic**

Replace `src/perch.ts`:

```typescript
#!/usr/bin/env bun
import { config, validateConfig } from "./config";
import { createLettaClient } from "./memory/letta";
import { gatherPerchContext } from "./perch/context";
import { decidePerchAction } from "./perch/decide";
import { sendMessage } from "./discord/sender";
import { appendLog } from "./memory/logs";
import { markTaskComplete } from "./tools/tasks";

const FULL_PERCH_INTERVAL_HOURS = 2;

function isFullPerchTick(now: Date): boolean {
  // Full perch tick at even hours (0, 2, 4, ...)
  return now.getUTCHours() % FULL_PERCH_INTERVAL_HOURS === 0 && now.getUTCMinutes() < 5;
}

async function main() {
  const timestamp = new Date().toISOString();
  const now = new Date();

  console.log(`[perch] Starting tick at ${timestamp}`);

  try {
    validateConfig();
  } catch (error) {
    console.error("[perch] Config validation failed:", error);
    process.exit(1);
  }

  const lettaClient = createLettaClient({
    baseURL: config.letta.baseUrl,
    apiKey: config.letta.apiKey,
  });

  // Gather context (includes due tasks check)
  console.log("[perch] Gathering context...");
  const context = await gatherPerchContext({
    lettaClient,
    agentId: config.letta.agentId,
  });

  const hasDueTasks = context.dueTasks.length > 0;
  const isFullTick = isFullPerchTick(now);

  // Fast path: no due tasks and not a full tick = exit silently
  if (!hasDueTasks && !isFullTick) {
    console.log("[perch] Fast path: no due tasks, not full tick. Exiting.");
    await appendLog("perch.jsonl", {
      timestamp,
      type: "perch_fast",
      content: "SKIP",
    });
    return;
  }

  // We have something to do - either due tasks or full tick
  console.log(`[perch] Due tasks: ${context.dueTasks.length}, Full tick: ${isFullTick}`);

  // Make decision (calls LLM)
  console.log("[perch] Deciding action...");
  const decision = await decidePerchAction(context, { hasDueTasks, isFullTick });

  if (!decision) {
    console.log("[perch] Decision: SILENT");
    await appendLog("perch.jsonl", {
      timestamp,
      type: "perch_tick",
      content: "SILENT",
      context: {
        hourOfDay: context.hourOfDay,
        dayOfWeek: context.dayOfWeek,
        dueTasks: context.dueTasks.length,
        isFullTick,
      },
    });

    // Mark due tasks as complete even if silent (they were processed)
    for (const task of context.dueTasks) {
      await markTaskComplete(lettaClient, config.letta.agentId, task.id);
    }
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
      dueTasks: context.dueTasks.map((t) => t.id),
    });

    await appendLog("journal.jsonl", {
      timestamp,
      type: "perch_message",
      content: `Bud (perch): ${decision.message}`,
    });

    // Mark due tasks as complete
    for (const task of context.dueTasks) {
      await markTaskComplete(lettaClient, config.letta.agentId, task.id);
    }
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

**Step 3: Run typecheck**

Run: `bun run typecheck`
Expected: No errors

**Step 4: Commit**

```bash
git add src/perch.ts src/perch/context.ts
git commit -m "feat: add fast path for perch ticks with task checking"
```

---

## Task 6: Update Decision Maker for Tasks

**Files:**
- Modify: `src/perch/decide.ts`

Update the LLM prompt to include due tasks context.

**Step 1: Update decidePerchAction signature and prompt**

Modify `src/perch/decide.ts`:

```typescript
import type { PerchContext } from "./context";

export interface PerchDecision {
  message: string;
  reason?: string;
}

export interface DecideOptions {
  hasDueTasks: boolean;
  isFullTick: boolean;
}

function buildPerchPrompt(context: PerchContext, options: DecideOptions): string {
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

  const dueTasksSection = context.dueTasks.length > 0
    ? `## Due Tasks (ACTION REQUIRED)\n${context.dueTasks
        .map((t) => `- ${t.description}${t.context ? ` (Context: ${t.context})` : ""}`)
        .join("\n")}\n\nThese tasks are due NOW. You should address them in your message.`
    : "";

  const tickType = options.isFullTick
    ? "This is a FULL perch tick (every 2 hours) - you may speak even without due tasks if appropriate."
    : "This is a FAST tick (every 5 min) - only speak if there are due tasks.";

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

${dueTasksSection}

## Recent Interactions (last 24h)
${interactionSummary}

## Tick Type
${tickType}

## Your Task
Decide whether to send a message to your owner RIGHT NOW.

${context.dueTasks.length > 0
  ? "You have due tasks - you should probably speak to address them."
  : "No due tasks. Only speak if you have something genuinely useful to say."}

## Response Format
If you decide to stay silent, respond with exactly:
SILENT

If you decide to speak, respond with:
SPEAK: [your message here]

Respond now:`;
}

export async function decidePerchAction(
  context: PerchContext,
  options: DecideOptions = { hasDueTasks: false, isFullTick: true }
): Promise<PerchDecision | null> {
  try {
    const prompt = buildPerchPrompt(context, options);

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

Don't forget to keep the `import { query } from "@anthropic-ai/claude-agent-sdk";` at the top.

**Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add src/perch/decide.ts
git commit -m "feat: update decision maker to handle due tasks"
```

---

## Task 7: Update Cron Schedule to 5 Minutes

**Files:**
- Modify: `app.json`
- Modify: `cron.d/perch`

Change perch to run every 5 minutes instead of every 2 hours.

**Step 1: Update app.json**

```json
{
  "cron": [
    {
      "command": "bun run src/perch.ts",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

**Step 2: Update cron.d/perch**

```
# Run perch tick every 5 minutes
*/5 * * * * /app/run-perch.sh
```

**Step 3: Commit**

```bash
git add app.json cron.d/perch
git commit -m "feat: change perch schedule to every 5 minutes"
```

---

## Task 8: Run All Tests and Deploy

**Step 1: Run full test suite**

Run: `bun test`
Expected: All tests pass (may need to run individually if mock interference)

**Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: No errors

**Step 3: Push and deploy**

```bash
git push origin main
git push dokku main
```

**Step 4: Add scheduled_tasks block to existing Letta agent**

Run from server or with SSH tunnel:
```bash
ssh dokku@sandmill.org run bud curl -X POST "http://172.17.0.1:8283/v1/agents/agent-66876a60-adb0-4d2e-985a-6cbe4b967b90/memory/block" \
  -H "Content-Type: application/json" \
  -d '{"label": "scheduled_tasks", "value": "[]", "limit": 10000}'
```

**Step 5: Verify cron updated**

```bash
ssh dokku@sandmill.org cron:list bud
```

Expected: Schedule shows `*/5 * * * *`

---

## Summary

| Task | Description |
|------|-------------|
| 1 | Add scheduled_tasks Letta block |
| 2 | Create task types and utilities |
| 3 | Create task scheduling tool functions |
| 4 | Add task tools to MCP server |
| 5 | Update perch with fast path |
| 6 | Update decision maker for tasks |
| 7 | Update cron to 5 minutes |
| 8 | Run tests and deploy |

**Key files:**
- `src/perch/tasks.ts` - Task types and utilities
- `src/tools/tasks.ts` - Task scheduling functions
- `src/tools/memory.ts` - MCP tools (updated)
- `src/perch.ts` - Fast path logic
- `src/perch/decide.ts` - Task-aware prompting
- `app.json` - 5-minute cron

**New tools for Bud:**
- `schedule_task` - Create reminder/task
- `cancel_task` - Remove a task
- `list_tasks` - Show all scheduled tasks

**Behavior:**
- Every 5 min: Fast path checks for due tasks (no LLM if nothing due)
- Every 2 hours: Full tick runs LLM decision even without tasks
- Due tasks are marked complete after processing (recurring tasks advance)
