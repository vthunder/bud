import type { Client } from "discord.js";
import type { McpStdioServerConfig } from "@anthropic-ai/claude-agent-sdk";
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

// Beads MCP server for issue tracking across repos
const BEADS_SERVER: McpStdioServerConfig = {
  type: "stdio",
  command: "beads-mcp",
  env: {
    BEADS_PATH: process.env.BEADS_PATH || "/app/node_modules/@beads/bd/bin/bd",
  },
};

// Beads tool names (mcp__<server>__<tool>) - must match actual beads-mcp tool names
export const BEADS_TOOL_NAMES = [
  "mcp__beads__discover_tools",
  "mcp__beads__get_tool_info",
  "mcp__beads__context",
  "mcp__beads__ready",
  "mcp__beads__list",
  "mcp__beads__show",
  "mcp__beads__create",
  "mcp__beads__update",
  "mcp__beads__close",
  "mcp__beads__reopen",
  "mcp__beads__dep",
  "mcp__beads__stats",
  "mcp__beads__blocked",
  "mcp__beads__admin",
];

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
        beads: BEADS_SERVER,
      },
      allowedTools: [
        ...BLOCK_TOOL_NAMES,
        ...CALENDAR_TOOL_NAMES,
        ...GITHUB_TOOL_NAMES,
        ...IMAGE_TOOL_NAMES,
        ...SKILL_TOOL_NAMES,
        ...BEADS_TOOL_NAMES,
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
