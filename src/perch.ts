#!/usr/bin/env bun
import { config, validateConfig } from "./config";
import { createLettaClient } from "./memory/letta";
import { gatherPerchContext } from "./perch/context";
import { decidePerchAction } from "./perch/decide";
import { sendMessage } from "./discord/sender";
import { appendLog } from "./memory/logs";

async function main() {
  const timestamp = new Date().toISOString();
  console.log(`[perch] Starting perch tick at ${timestamp}`);

  try {
    validateConfig();
  } catch (error) {
    console.error("[perch] Config validation failed:", error);
    process.exit(1);
  }

  // Create Letta client
  const lettaClient = createLettaClient({
    baseURL: config.letta.baseUrl,
    apiKey: config.letta.apiKey,
  });

  // Gather context
  console.log("[perch] Gathering context...");
  const context = await gatherPerchContext({
    lettaClient,
    agentId: config.letta.agentId,
  });

  // Make decision
  console.log("[perch] Deciding action...");
  const decision = await decidePerchAction(context);

  if (!decision) {
    console.log("[perch] Decision: SILENT");
    await appendLog("perch.jsonl", {
      timestamp,
      type: "perch_tick",
      content: "SILENT",
      context: {
        hourOfDay: context.hourOfDay,
        dayOfWeek: context.dayOfWeek,
        hoursSinceLastInteraction: context.hoursSinceLastInteraction,
      },
    });
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
    });

    // Also log to journal for context in future ticks
    await appendLog("journal.jsonl", {
      timestamp,
      type: "perch_message",
      content: `Bud (perch): ${decision.message}`,
    });
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
