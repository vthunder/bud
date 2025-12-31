import type { Client } from "discord.js";
import { config, getDbPath, getJournalPath } from "./config";
import { initDatabase, getBlocksByLayer } from "./memory/blocks";
import { initJournal, appendJournal, getRecentJournal } from "./memory/journal";
import { buildFullPrompt, type PromptContext } from "./prompt";
import { createBlockToolsServer, BLOCK_TOOL_NAMES } from "./tools/blocks";
import { createCalendarToolsServer, CALENDAR_TOOL_NAMES } from "./tools/calendar";
import { createGitHubToolsServer, GITHUB_TOOL_NAMES } from "./tools/github";
import { createImageToolsServer, IMAGE_TOOL_NAMES } from "./tools/images";
import { createSkillToolsServer, SKILL_TOOL_NAMES } from "./tools/skills";
import { parseReposJson } from "./integrations/github";
import { listSkillNames } from "./skills";
import { executeWithYield } from "./execution";
import { setState, clearPreempt } from "./state";
import { getRemainingBudget, checkDailyReset } from "./budget";

export interface AgentContext {
  userId: string;
  username: string;
  channelId: string;
  discordClient: Client;
}

export interface AgentResult {
  response: string;
  toolsUsed: string[];
  yielded?: boolean;
}

let initialized = false;

function ensureInitialized(): void {
  if (!initialized) {
    initDatabase(getDbPath());
    initJournal(getJournalPath());
    initialized = true;
  }
}

async function loadPromptContext(): Promise<PromptContext> {
  const identity = getBlocksByLayer(2);
  const semantic = getBlocksByLayer(3);
  const working = getBlocksByLayer(4);
  const journal = await getRecentJournal(40);
  const skills = await listSkillNames(config.skills.path);
  return { identity, semantic, working, journal, skills };
}

export async function invokeAgent(
  userMessage: string,
  context: AgentContext,
  sessionBudget?: number
): Promise<AgentResult> {
  try {
    ensureInitialized();
    checkDailyReset("Europe/Berlin");
    clearPreempt();
    setState({
      status: "working",
      current_task: `Discord: ${userMessage.slice(0, 50)}`,
      started_at: new Date().toISOString(),
    });

    // Log trigger to journal
    await appendJournal({
      type: "trigger",
      trigger_type: "message",
      from: context.username,
      preview: userMessage.slice(0, 100),
    });

    // Load prompt context from local memory
    const promptContext = await loadPromptContext();

    // Create MCP servers
    const memoryServer = createBlockToolsServer();
    const calendarServer = createCalendarToolsServer();

    // Load GitHub repos from working memory
    const reposJson = promptContext.working.github_repos || "[]";
    const githubRepos = parseReposJson(reposJson);
    const githubServer = createGitHubToolsServer(githubRepos);

    // Create image tools server
    const imageServer = createImageToolsServer(context.discordClient, context.channelId);

    // Create skills tools server
    const skillsServer = createSkillToolsServer();

    const prompt = buildFullPrompt(promptContext, {
      type: "message",
      content: userMessage,
      from: context.username,
    });

    // Use session budget or remaining daily budget (max $1.00 per message)
    const budget = sessionBudget ?? Math.min(getRemainingBudget(), 1.00);

    const result = await executeWithYield({
      prompt,
      mcpServers: {
        memory: memoryServer,
        calendar: calendarServer,
        github: githubServer,
        images: imageServer,
        skills: skillsServer,
      },
      allowedTools: [
        ...BLOCK_TOOL_NAMES,
        ...CALENDAR_TOOL_NAMES,
        ...GITHUB_TOOL_NAMES,
        ...IMAGE_TOOL_NAMES,
        ...SKILL_TOOL_NAMES,
      ],
      sessionBudget: budget,
    });

    // Log response sent
    await appendJournal({
      type: "message_sent",
      to: context.username,
      preview: result.response.slice(0, 100),
      tools_used: result.toolsUsed,
      cost: result.totalCost,
      yielded: result.yielded,
    });

    setState({ status: "idle", current_task: null });

    return {
      response: result.response || "I apologize, but I couldn't generate a response.",
      toolsUsed: result.toolsUsed,
      yielded: result.yielded,
    };
  } catch (error) {
    console.error("[agent] Error:", error);
    // Log error to journal
    await appendJournal({
      type: "error",
      error: error instanceof Error ? error.message : String(error),
      context: "invokeAgent",
    });
    setState({ status: "idle", current_task: null });
    return {
      response: "I encountered an error processing your request. Please try again.",
      toolsUsed: [],
    };
  }
}
