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
