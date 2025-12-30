import { query } from "@anthropic-ai/claude-agent-sdk";
import { config } from "./config";
import { createLettaClient, loadContext, getMemoryBlock, type BudContext } from "./memory/letta";
import { createMemoryToolsServer, MEMORY_TOOL_NAMES } from "./tools/memory";
import { createCalendarToolsServer, CALENDAR_TOOL_NAMES } from "./tools/calendar";
import { createGitHubToolsServer, GITHUB_TOOL_NAMES } from "./tools/github";
import { parseReposJson } from "./integrations/github";
import { loadSkills } from "./skills";

export interface AgentContext {
  userId: string;
  username: string;
  channelId: string;
}

export interface AgentResult {
  response: string;
  toolsUsed: string[];
}

function buildSystemPrompt(memory: BudContext, skills: string): string {
  return `You are Bud, a personal assistant and development companion.
You maintain persistent memory across conversations through Letta memory blocks.
If you didn't write it down, you won't remember it next message.

## Your Identity
${memory.persona || "Helpful but not sycophantic. Direct communication style, minimal fluff."}

## Current Focus
${memory.currentFocus || "No specific focus set."}

## About Your Owner
${memory.ownerContext || "No owner context available."}

## Timezone
${memory.timezone || "UTC"}

## Memory Tools
You have access to memory tools to persist information:
- list_memory: See available memory blocks
- get_memory: Read a memory block
- set_memory: Update a memory block (use this to remember things!)

When you learn something important about your owner, your tasks, or yourself,
use set_memory to persist it. Otherwise you will forget it next message.

## Calendar Tools
You have access to Google Calendar:
- calendar_events: List upcoming events (defaults to next 7 days)
- calendar_event_details: Get full details of a specific event
- calendar_create_event: Create a new calendar event
- calendar_availability: Check free/busy times

## GitHub Tools
You have access to GitHub for monitored repos:
- github_prs: List open pull requests
- github_issues: List open issues assigned to you
- github_pr_details: Get details of a specific PR
- github_notifications: Check unread notifications

To manage which repos you monitor, update your github_repos memory block.
Format: ["owner/repo1", "owner/repo2"]

## Self-Improvement
You can modify your own code! You have access to Bash, Read, Write, and Edit tools.
When you identify bugs or improvements, follow your self-improve skill.
All changes go through PR review - never push directly to main.

${skills ? `## Skills\n\n${skills}` : ""}
`;
}

export async function invokeAgent(
  userMessage: string,
  context: AgentContext
): Promise<AgentResult> {
  try {
    // Create Letta client
    const lettaClient = createLettaClient({
      baseURL: config.letta.baseUrl,
      apiKey: config.letta.apiKey,
    });

    // Load memory from Letta
    const memory = await loadContext(lettaClient, config.letta.agentId);

    // Create MCP servers
    const memoryServer = createMemoryToolsServer(lettaClient, config.letta.agentId);
    const calendarServer = createCalendarToolsServer();

    // Load GitHub repos from memory and create GitHub server
    const reposJson = await getMemoryBlock(lettaClient, config.letta.agentId, "github_repos");
    const githubRepos = parseReposJson(reposJson);
    const githubServer = createGitHubToolsServer(githubRepos);

    // Load skills
    const skills = await loadSkills("/app/state/.claude/skills");

    const systemPrompt = buildSystemPrompt(memory, skills);
    const prompt = `${systemPrompt}\n\n---\n\n[Message from ${context.username}]: ${userMessage}`;

    const toolsUsed: string[] = [];
    let responseText = "";

    const result = query({
      prompt,
      options: {
        permissionMode: "bypassPermissions",
        mcpServers: {
          "letta-memory": memoryServer,
          "calendar": calendarServer,
          "github": githubServer,
        },
        allowedTools: [...MEMORY_TOOL_NAMES, ...CALENDAR_TOOL_NAMES, ...GITHUB_TOOL_NAMES],
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
          }
        }
      } else if (message.type === "result" && "result" in message) {
        if (message.result) {
          responseText = message.result;
        }
      }
    }

    return {
      response: responseText || "I apologize, but I couldn't generate a response.",
      toolsUsed,
    };
  } catch (error) {
    console.error("[agent] Error:", error);
    return {
      response: "I encountered an error processing your request. Please try again.",
      toolsUsed: [],
    };
  }
}
