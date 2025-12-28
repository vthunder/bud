import { query } from "@anthropic-ai/claude-agent-sdk";
import { config } from "./config";
import { createLettaClient, loadContext, type BudContext } from "./memory/letta";
import { createMemoryToolsServer, MEMORY_TOOL_NAMES } from "./tools/memory";

export interface AgentContext {
  userId: string;
  username: string;
  channelId: string;
}

export interface AgentResult {
  response: string;
  toolsUsed: string[];
}

function buildSystemPrompt(memory: BudContext): string {
  return `You are Bud, a personal assistant and development companion.
You maintain persistent memory across conversations through Letta memory blocks.
If you didn't write it down, you won't remember it next message.

## Your Identity
${memory.persona || "Helpful but not sycophantic. Direct communication style, minimal fluff."}

## Current Focus
${memory.currentFocus || "No specific focus set."}

## About Your Owner
${memory.ownerContext || "No owner context available."}

## Timezone
${memory.timezone || "UTC"}

## Memory Tools
You have access to memory tools to persist information:
- list_memory: See available memory blocks
- get_memory: Read a memory block
- set_memory: Update a memory block (use this to remember things!)

When you learn something important about your owner, your tasks, or yourself,
use set_memory to persist it. Otherwise you will forget it next message.

## Current Limitations
- You are in Phase 2.5: memory persistence via Letta is active
- No ambient compute yet (coming soon)
- No GitHub/Calendar integrations yet (coming soon)
`;
}

export async function invokeAgent(
  userMessage: string,
  context: AgentContext
): Promise<AgentResult> {
  try {
    // Create Letta client
    const lettaClient = createLettaClient({
      baseURL: config.letta.baseUrl,
      apiKey: config.letta.apiKey,
    });

    // Load memory from Letta
    const memory = await loadContext(lettaClient, config.letta.agentId);

    // Create memory tools MCP server
    const memoryServer = createMemoryToolsServer(lettaClient, config.letta.agentId);

    const systemPrompt = buildSystemPrompt(memory);
    const prompt = `${systemPrompt}\n\n---\n\n[Message from ${context.username}]: ${userMessage}`;

    const toolsUsed: string[] = [];
    let responseText = "";

    const result = query({
      prompt,
      options: {
        permissionMode: "bypassPermissions",
        mcpServers: {
          "letta-memory": memoryServer,
        },
        allowedTools: MEMORY_TOOL_NAMES,
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
          }
        }
      } else if (message.type === "result" && "result" in message) {
        if (message.result) {
          responseText = message.result;
        }
      }
    }

    return {
      response: responseText || "I apologize, but I couldn't generate a response.",
      toolsUsed,
    };
  } catch (error) {
    console.error("[agent] Error:", error);
    return {
      response: "I encountered an error processing your request. Please try again.",
      toolsUsed: [],
    };
  }
}
