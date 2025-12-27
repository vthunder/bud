import { query, type SDKMessage, type SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";

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
  const prompt = `[Context: Message from ${context.username} in channel ${context.channelId}]\n\n${userMessage}`;

  const toolsUsed: string[] = [];

  const result = query({
    prompt,
    options: {
      systemPrompt: SYSTEM_PROMPT,
      maxTurns: 1,
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      // Disable tools for Phase 1 - just chat responses
      tools: [],
    },
  });

  let finalResult: SDKResultMessage | undefined;
  let responseText = "";

  for await (const message of result) {
    if (message.type === "assistant") {
      // Extract text from assistant message content blocks
      for (const block of message.message.content) {
        if (block.type === "text") {
          responseText += block.text;
        } else if (block.type === "tool_use") {
          toolsUsed.push(block.name);
        }
      }
    } else if (message.type === "result") {
      finalResult = message;
    }
  }

  // If we have a result message with a result string, prefer that
  if (finalResult && finalResult.subtype === "success" && finalResult.result) {
    responseText = finalResult.result;
  }

  return {
    response: responseText || "I apologize, but I couldn't generate a response.",
    toolsUsed,
  };
}
