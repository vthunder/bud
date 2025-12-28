import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type Letta from "@letta-ai/letta-client";
import { getMemoryBlock, setMemoryBlock } from "../memory/letta";

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

  return createSdkMcpServer({
    name: "letta-memory",
    version: "1.0.0",
    tools: [getMemoryTool, setMemoryTool, listMemoryTool],
  });
}

export const MEMORY_TOOL_NAMES = [
  "mcp__letta-memory__get_memory",
  "mcp__letta-memory__set_memory",
  "mcp__letta-memory__list_memory",
];
