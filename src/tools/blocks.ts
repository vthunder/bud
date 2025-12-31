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
