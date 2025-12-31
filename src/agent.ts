import { query } from "@anthropic-ai/claude-agent-sdk";
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

export interface AgentContext {
  userId: string;
  username: string;
  channelId: string;
  discordClient: Client;
}

export interface AgentResult {
  response: string;
  toolsUsed: string[];
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
  context: AgentContext
): Promise<AgentResult> {
  try {
    ensureInitialized();

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

    const toolsUsed: string[] = [];
    let responseText = "";

    const result = query({
      prompt,
      options: {
        permissionMode: "bypassPermissions",
        mcpServers: {
          memory: memoryServer,
          calendar: calendarServer,
          github: githubServer,
          images: imageServer,
          skills: skillsServer,
        },
        allowedTools: [...BLOCK_TOOL_NAMES, ...CALENDAR_TOOL_NAMES, ...GITHUB_TOOL_NAMES, ...IMAGE_TOOL_NAMES, ...SKILL_TOOL_NAMES],
        pathToClaudeCodeExecutable: "/usr/bin/claude",
      },
    });

    for await (const message of result) {
      if (message.type === "assistant" && "message" in message) {
        for (const block of message.message.content) {
          if (block.type === "text") {
            responseText += block.text;
          } else if (block.type === "tool_use") {
            toolsUsed.push(block.name);
            // Log tool usage
            await appendJournal({
              type: "tool_use",
              tool: block.name,
            });
          }
        }
      } else if (message.type === "result" && "result" in message) {
        if (message.result) {
          responseText = message.result;
        }
      }
    }

    // Log response sent
    await appendJournal({
      type: "message_sent",
      to: context.username,
      preview: responseText.slice(0, 100),
      tools_used: toolsUsed,
    });

    return {
      response: responseText || "I apologize, but I couldn't generate a response.",
      toolsUsed,
    };
  } catch (error) {
    console.error("[agent] Error:", error);
    // Log error to journal
    await appendJournal({
      type: "error",
      error: error instanceof Error ? error.message : String(error),
      context: "invokeAgent",
    });
    return {
      response: "I encountered an error processing your request. Please try again.",
      toolsUsed: [],
    };
  }
}
