import { Client, Events, GatewayIntentBits, Message } from "discord.js";
import { config, validateConfig, getDbPath, getJournalPath } from "./config";
import { invokeAgent } from "./agent";
import { appendLog } from "./memory/logs";
import { initDatabase } from "./memory/blocks";
import { initJournal } from "./memory/journal";

validateConfig();

// Initialize memory at startup
initDatabase(getDbPath());
initJournal(getJournalPath());

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once(Events.ClientReady, (c) => {
  console.log(`[bud] Ready! Logged in as ${c.user.tag}`);
});

client.on(Events.MessageCreate, async (message: Message) => {
  // Ignore bot messages and messages outside our channel
  if (message.author.bot) return;
  if (message.channelId !== config.discord.channelId) return;

  const timestamp = new Date().toISOString();
  console.log(`[bud] ${timestamp} Message from ${message.author.username}: ${message.content}`);

  try {
    // Show typing indicator
    if ("sendTyping" in message.channel) {
      await message.channel.sendTyping();
    }

    const result = await invokeAgent(message.content, {
      userId: message.author.id,
      username: message.author.username,
      channelId: message.channelId,
      discordClient: client,
    });

    if (result.response) {
      await message.reply(result.response);
    }

    // Log the interaction (non-fatal if it fails)
    try {
      await appendLog("journal.jsonl", {
        timestamp,
        type: "interaction",
        content: `User: ${message.content}\nBud: ${result.response}`,
        userId: message.author.id,
        toolsUsed: result.toolsUsed,
      });
    } catch (logError) {
      console.error("[bud] Failed to log interaction:", logError);
    }
  } catch (error) {
    console.error("[bud] Error processing message:", error);

    try {
      await appendLog("events.jsonl", {
        timestamp,
        type: "error",
        content: error instanceof Error ? error.message : String(error),
      });
    } catch (logError) {
      console.error("[bud] Failed to log error:", logError);
    }

    await message.reply("Sorry, I encountered an error processing your message.");
  }
});

client.login(config.discord.token);
