import { getDefaultSession } from "../claude-session";
import type { PerchContext } from "./context";

export interface PerchDecision {
  message: string;
  reason?: string;
}

export interface DecideOptions {
  hasDueTasks: boolean;
  isFullTick: boolean;
}

function buildPerchPrompt(
  context: PerchContext,
  options: DecideOptions
): string {
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

  // Build due tasks section if there are any
  const dueTasksSection =
    context.dueTasks.length > 0
      ? `## Due Tasks (ACTION REQUIRED)
${context.dueTasks.map((t) => `- ${t.description}${t.context ? ` (Context: ${t.context})` : ""}`).join("\n")}

These tasks are due NOW. You should address them in your message.

`
      : "";

  // Build GitHub activity section
  const githubSection = context.hasNewGitHub
    ? `## GitHub Activity (NEW)
${context.githubSummary}

You have new GitHub activity. Consider mentioning it.

`
    : "";

  // Build calendar section
  const calendarSection = context.calendarSummary
    ? `## Calendar (Next 7 Days)
${context.calendarSummary}

Use your judgment about which events warrant preparation or reminders.
Consider: event type, attendees, time until event, your knowledge of the owner's preferences.

`
    : "";

  // Build tick type section
  const tickTypeSection = options.isFullTick
    ? "This is a FULL perch tick (every 2 hours) - you may speak even without due tasks if appropriate."
    : "This is a FAST tick (every 5 min) - only speak if there are due tasks.";

  // Build task guidance
  const taskGuidance = options.hasDueTasks
    ? "You have due tasks - you should probably speak to address them."
    : "No due tasks. Only speak if you have something genuinely useful to say.";

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

## Tick Type
${tickTypeSection}

${dueTasksSection}${githubSection}${calendarSection}## Recent Interactions (last 24h)
${interactionSummary}

## Your Task
Decide whether to proactively send a message to your owner RIGHT NOW.

${taskGuidance}

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
  context: PerchContext,
  options: DecideOptions = { hasDueTasks: false, isFullTick: true }
): Promise<PerchDecision | null> {
  try {
    const prompt = buildPerchPrompt(context, options);

    const session = getDefaultSession();
    const result = await session.sendMessage(prompt, {
      timeoutMs: 60000, // 1 minute for decision
    });

    const responseText = result.response.trim();

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
