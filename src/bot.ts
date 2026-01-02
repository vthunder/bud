import { Client, Events, GatewayIntentBits, Message } from "discord.js";
import { config, validateConfig, getDbPath, getJournalPath } from "./config";
import { invokeAgent } from "./agent";
import { appendLog } from "./memory/logs";
import { initDatabase } from "./memory/blocks";
import { initJournal } from "./memory/journal";
import { getState, requestPreempt, clearPreempt } from "./state";
import { checkDailyReset } from "./budget";

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

// Track pending messages when preempting
const pendingMessages: Message[] = [];

client.once(Events.ClientReady, (c) => {
  console.log(`[bud] Ready! Logged in as ${c.user.tag}`);
  checkDailyReset("Europe/Berlin");
});

client.on(Events.MessageCreate, async (message: Message) => {
  // Ignore bot messages and messages outside our channel
  if (message.author.bot) return;
  if (message.channelId !== config.discord.channelId) return;

  // Check if Bud is currently working
  const state = getState();
  if (state.status === "working") {
    console.log(`[bud] Currently working on: ${state.current_task}, requesting preempt`);

    // Send "please wait" message
    await message.reply("One moment, I'm finishing something up...");

    // Request preemption
    requestPreempt(`Discord message from ${message.author.username}`);

    // Queue this message
    pendingMessages.push(message);

    // Wait for state to become idle (poll every 2 seconds, timeout after 60s)
    const maxWait = 60000;
    const pollInterval = 2000;
    let waited = 0;

    while (waited < maxWait) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      waited += pollInterval;

      const currentState = getState();
      if (currentState.status === "idle") {
        console.log(`[bud] Preemption complete after ${waited}ms`);
        break;
      }
    }

    // Remove from pending
    const idx = pendingMessages.indexOf(message);
    if (idx > -1) pendingMessages.splice(idx, 1);

    // Clear preempt flag
    clearPreempt();
  }

  const timestamp = new Date().toISOString();
  console.log(`[bud] ${timestamp} Message from ${message.author.username}: ${message.content}`);

  // Set up continuous typing indicator
  let typingInterval: ReturnType<typeof setInterval> | null = null;

  try {
    // Start typing indicator and keep it refreshed
    if ("sendTyping" in message.channel) {
      await message.channel.sendTyping();
      typingInterval = setInterval(async () => {
        try {
          if ("sendTyping" in message.channel) {
            await message.channel.sendTyping();
          }
        } catch (error) {
          console.error("[bot] Failed to refresh typing:", error);
        }
      }, 8000);
    }

    const result = await invokeAgent(message.content, {
      userId: message.author.id,
      username: message.author.username,
      channelId: message.channelId,
      discordClient: client,
    });

    // Stop typing before sending reply
    if (typingInterval) {
      clearInterval(typingInterval);
      typingInterval = null;
    }

    if (result.response) {
      // Discord has a 2000 char limit per message
      const MAX_LENGTH = 2000;
      if (result.response.length <= MAX_LENGTH) {
        await message.reply(result.response);
      } else {
        // Split into chunks, preferring line breaks
        const chunks: string[] = [];
        let remaining = result.response;
        while (remaining.length > 0) {
          if (remaining.length <= MAX_LENGTH) {
            chunks.push(remaining);
            break;
          }
          // Find a good break point (newline or space)
          let breakPoint = remaining.lastIndexOf('\n', MAX_LENGTH);
          if (breakPoint < MAX_LENGTH / 2) {
            breakPoint = remaining.lastIndexOf(' ', MAX_LENGTH);
          }
          if (breakPoint < MAX_LENGTH / 2) {
            breakPoint = MAX_LENGTH; // Force break if no good point
          }
          chunks.push(remaining.slice(0, breakPoint));
          remaining = remaining.slice(breakPoint).trimStart();
        }
        // Send first chunk as reply, rest as follow-ups
        await message.reply(chunks[0]);
        for (let i = 1; i < chunks.length; i++) {
          if ('send' in message.channel) {
            await message.channel.send(chunks[i]);
          }
        }
      }
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
    // Stop typing on error
    if (typingInterval) {
      clearInterval(typingInterval);
      typingInterval = null;
    }

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
