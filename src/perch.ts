#!/usr/bin/env bun
import { config, validateConfig, getDbPath } from "./config";
import { initDatabase } from "./memory/blocks";
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

  // Initialize SQLite database
  initDatabase(getDbPath());

  // Gather context (includes due tasks check)
  console.log("[perch] Gathering context...");
  const context = await gatherPerchContext();

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
      markTaskComplete(task.id);
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
      markTaskComplete(task.id);
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
