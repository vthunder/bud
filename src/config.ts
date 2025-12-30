export const config = {
  discord: {
    token: process.env.DISCORD_TOKEN ?? "",
    channelId: process.env.DISCORD_CHANNEL_ID ?? "",
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY ?? "",
  },
  letta: {
    baseUrl: process.env.LETTA_API_URL ?? "https://api.letta.com",
    apiKey: process.env.LETTA_API_KEY ?? "",
    agentId: process.env.LETTA_AGENT_ID ?? "",
  },
  github: {
    token: process.env.GITHUB_TOKEN ?? "",
  },
  replicate: {
    apiToken: process.env.REPLICATE_API_TOKEN ?? "",
  },
  calendar: {
    serviceAccountJson: process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? "",
    calendarIds: (process.env.GOOGLE_CALENDAR_IDS ?? "").split(",").filter(Boolean),
  },
  skills: {
    path: process.env.SKILLS_PATH || "/app/state/.claude/skills",
  },
} as const;

export function validateConfig(): void {
  const required = [
    ["DISCORD_TOKEN", config.discord.token],
    ["DISCORD_CHANNEL_ID", config.discord.channelId],
    ["ANTHROPIC_API_KEY", config.anthropic.apiKey],
    ["LETTA_API_KEY", config.letta.apiKey],
    ["LETTA_AGENT_ID", config.letta.agentId],
  ] as const;

  const missing = required.filter(([, value]) => !value).map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
}
