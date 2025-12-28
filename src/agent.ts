import { query } from "@anthropic-ai/claude-agent-sdk";

export interface AgentContext {
  userId: string;
  username: string;
  channelId: string;
}

export interface AgentResult {
  response: string;
  toolsUsed: string[];
}

const SYSTEM_CONTEXT = `You are Bud, a personal assistant and development companion.
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
  try {
    // Prepend system context to the prompt
    const prompt = `${SYSTEM_CONTEXT}\n\n---\n\n[Message from ${context.username}]: ${userMessage}`;

    console.log("[agent] Starting query...");
    const toolsUsed: string[] = [];
    let responseText = "";

    // Enable SDK debug mode
    process.env.DEBUG_CLAUDE_AGENT_SDK = "1";

    const result = query({
      prompt,
      options: {
        permissionMode: "bypassPermissions",
        // Start with no tools for basic chat
        allowedTools: [],
        // Explicitly set path to claude executable
        pathToClaudeCodeExecutable: "/usr/bin/claude",
        // Capture stderr for debugging
        stderr: (msg: string) => console.error("[claude stderr]", msg),
      },
    });

    console.log("[agent] Iterating messages...");
    for await (const message of result) {
      console.log("[agent] Message type:", message.type);
      if (message.type === "assistant" && "message" in message) {
        for (const block of message.message.content) {
          if (block.type === "text") {
            responseText += block.text;
          } else if (block.type === "tool_use") {
            toolsUsed.push(block.name);
          }
        }
      } else if (message.type === "result" && "result" in message) {
        // Prefer the final result if available
        if (message.result) {
          responseText = message.result;
        }
      }
    }

    console.log("[agent] Done. Response length:", responseText.length);
    return {
      response: responseText || "I apologize, but I couldn't generate a response.",
      toolsUsed,
    };
  } catch (error) {
    console.error("[agent] SDK error:", error);
    console.error("[agent] Error stack:", error instanceof Error ? error.stack : "no stack");
    return {
      response: "I encountered an error processing your request. Please try again.",
      toolsUsed: [],
    };
  }
}
