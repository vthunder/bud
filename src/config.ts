export const config = {
  discord: {
    token: process.env.DISCORD_TOKEN ?? "",
    channelId: process.env.DISCORD_CHANNEL_ID ?? "",
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY ?? "",
  },
  state: {
    path: process.env.STATE_PATH ?? "/app/state",
    dbName: "memory.db",
    journalName: "journal.jsonl",
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
  projects: {
    path: process.env.PROJECTS_PATH || "/app/state/projects",
  },
} as const;

export function getDbPath(): string {
  return `${config.state.path}/${config.state.dbName}`;
}

export function getJournalPath(): string {
  return `${config.state.path}/${config.state.journalName}`;
}

export function getProjectsPath(): string {
  return config.projects.path;
}

export function validateConfig(): void {
  const required = [
    ["DISCORD_TOKEN", config.discord.token],
    ["DISCORD_CHANNEL_ID", config.discord.channelId],
    // ANTHROPIC_API_KEY is optional - Claude Code can use OAuth instead
  ] as const;

  const missing = required.filter(([, value]) => !value).map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
}
