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
