import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type Letta from "@letta-ai/letta-client";
import { getMemoryBlock, setMemoryBlock } from "../memory/letta";
import {
  scheduleTask,
  cancelTask,
  listScheduledTasks,
} from "./tasks";

export function createMemoryToolsServer(client: Letta, agentId: string) {
  const getMemoryTool = tool(
    "get_memory",
    "Retrieve a memory block by label. Available blocks: persona, current_focus, owner_context, timezone, patterns, limitations",
    {
      label: z.string().describe("Memory block label (e.g., 'persona', 'current_focus', 'patterns')"),
    },
    async (args) => {
      try {
        const value = await getMemoryBlock(client, agentId, args.label);
        return {
          content: [
            {
              type: "text" as const,
              text: value || `(empty - block '${args.label}' has no content)`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error reading memory block '${args.label}': ${error}`,
            },
          ],
        };
      }
    }
  );

  const setMemoryTool = tool(
    "set_memory",
    "Update a memory block. Use this to persist important information across conversations. Available blocks: persona, current_focus, owner_context, timezone, patterns, limitations",
    {
      label: z.string().describe("Memory block label (e.g., 'current_focus', 'patterns')"),
      value: z.string().describe("New content for the memory block"),
    },
    async (args) => {
      try {
        await setMemoryBlock(client, agentId, args.label, args.value);
        return {
          content: [
            {
              type: "text" as const,
              text: `Successfully updated memory block '${args.label}'`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error updating memory block '${args.label}': ${error}`,
            },
          ],
        };
      }
    }
  );

  const listMemoryTool = tool(
    "list_memory",
    "List all available memory block labels",
    {},
    async () => {
      const labels = [
        "persona - Your personality and values",
        "current_focus - What you're currently working on",
        "owner_context - Information about your owner",
        "timezone - Owner's timezone",
        "patterns - Observed patterns and learnings",
        "limitations - Known constraints",
      ];
      return {
        content: [
          {
            type: "text" as const,
            text: `Available memory blocks:\n${labels.join("\n")}`,
          },
        ],
      };
    }
  );

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
}

export const MEMORY_TOOL_NAMES = [
  "mcp__letta-memory__get_memory",
  "mcp__letta-memory__set_memory",
  "mcp__letta-memory__list_memory",
  "mcp__letta-memory__schedule_task",
  "mcp__letta-memory__cancel_task",
  "mcp__letta-memory__list_tasks",
];
