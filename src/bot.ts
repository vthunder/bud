import { Client, Events, GatewayIntentBits, Message } from "discord.js";
import { config, validateConfig } from "./config";

validateConfig();

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

  console.log(`[bud] Message from ${message.author.username}: ${message.content}`);

  // Placeholder: echo for now
  await message.reply(`Echo: ${message.content}`);
});

client.login(config.discord.token);
