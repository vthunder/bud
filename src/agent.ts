import { query } from "@anthropic-ai/claude-agent-sdk";
import { config } from "./config";
import { createLettaClient, loadContext, type BudContext } from "./memory/letta";

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
You maintain persistent memory across conversations through Letta blocks and state files.
If you didn't write it down, you won't remember it next message.

## Your Identity
${memory.persona || "Helpful but not sycophantic. Direct communication style, minimal fluff."}

## Current Focus
${memory.currentFocus || "No specific focus set."}

## About Your Owner
${memory.ownerContext || "No owner context available."}

## Timezone
${memory.timezone || "UTC"}

## Current Limitations
- You are in Phase 2: memory persistence is active
- No ambient compute yet (coming soon)
- No GitHub/Calendar integrations yet (coming soon)
`;
}

export async function invokeAgent(
  userMessage: string,
  context: AgentContext
): Promise<AgentResult> {
  try {
    // Load memory from Letta
    const lettaClient = createLettaClient({
      baseURL: config.letta.baseUrl,
      apiKey: config.letta.apiKey,
    });
    const memory = await loadContext(lettaClient, config.letta.agentId);

    const systemPrompt = buildSystemPrompt(memory);
    const prompt = `${systemPrompt}\n\n---\n\n[Message from ${context.username}]: ${userMessage}`;

    const toolsUsed: string[] = [];
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
