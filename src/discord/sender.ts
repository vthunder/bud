import { Client, GatewayIntentBits, type TextChannel } from "discord.js";

export interface SendMessageOptions {
  token: string;
  channelId: string;
  content: string;
}

export interface SendMessageResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

// Typing indicator state
let typingClient: Client | null = null;
let typingInterval: ReturnType<typeof setInterval> | null = null;
let typingChannel: TextChannel | null = null;

export async function startTyping(token: string, channelId: string): Promise<void> {
  // Clean up any existing typing state
  await stopTyping();

  typingClient = new Client({
    intents: [GatewayIntentBits.Guilds],
  });

  try {
    await typingClient.login(token);
    const channel = await typingClient.channels.fetch(channelId);

    if (!channel || !("sendTyping" in channel)) {
      throw new Error("Channel not found or not a text channel");
    }

    typingChannel = channel as TextChannel;

    // Send initial typing indicator
    await typingChannel.sendTyping();

    // Refresh every 8 seconds (indicator lasts ~10s)
    typingInterval = setInterval(async () => {
      try {
        if (typingChannel) {
          await typingChannel.sendTyping();
        }
      } catch (error) {
        console.error("[typing] Failed to refresh typing:", error);
      }
    }, 8000);

    console.log("[typing] Started typing indicator");
  } catch (error) {
    console.error("[typing] Failed to start typing:", error);
    await stopTyping();
  }
}

export async function stopTyping(): Promise<void> {
  if (typingInterval) {
    clearInterval(typingInterval);
    typingInterval = null;
  }

  if (typingClient) {
    try {
      await typingClient.destroy();
    } catch (error) {
      console.error("[typing] Failed to destroy client:", error);
    }
    typingClient = null;
  }

  typingChannel = null;
  console.log("[typing] Stopped typing indicator");
}

export async function sendMessage(
  options: SendMessageOptions
): Promise<SendMessageResult> {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
  });

  try {
    await client.login(options.token);

    const channel = await client.channels.fetch(options.channelId);
    if (!channel || !("send" in channel)) {
      throw new Error("Channel not found or not a text channel");
    }

    const message = await (channel as TextChannel).send(options.content);

    return {
      success: true,
      messageId: message.id,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await client.destroy();
  }
}
