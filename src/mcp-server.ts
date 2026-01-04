#!/usr/bin/env bun
/**
 * Standalone MCP Server for Bud
 *
 * This is a stdio-based MCP server using raw JSON-RPC.
 * It hosts all the custom tools (memory, calendar, github, skills).
 *
 * Run with: bun run src/mcp-server.ts
 */

import { config } from "./config";
import {
  getFocus,
  setFocus,
  getInbox,
  setInbox,
  getCommitments,
  setCommitments,
  appendJournal,
} from "./memory/working";
import { loadCoreMemory } from "./memory/core";
import {
  getGithubRepos,
  listSkillNames,
  getSkillContent,
  listProjectNames,
  getProjectContent,
  saveProjectContent,
} from "./memory/long_term";
import {
  listEvents,
  getEvent,
  createEvent,
  getFreeBusy,
  formatEventForDisplay,
} from "./integrations/calendar";
import {
  listPRs,
  listIssues,
  getPRDetails,
  getNotifications,
  formatPRForDisplay,
  formatIssueForDisplay,
} from "./integrations/github";
import * as readline from "readline";
import { sendMessage } from "./discord/sender";

// Tool definitions
const tools = [
  // Working memory tools
  {
    name: "get_focus",
    description: "Read the current focus (2_working/focus.md)",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "set_focus",
    description: "Update the current focus",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string", description: "New focus content" },
      },
      required: ["content"],
    },
  },
  {
    name: "get_inbox",
    description: "Read the inbox (2_working/inbox.md)",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "set_inbox",
    description: "Update the inbox",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string", description: "New inbox content" },
      },
      required: ["content"],
    },
  },
  {
    name: "get_commitments",
    description: "Read commitments (2_working/commitments.md)",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "set_commitments",
    description: "Update commitments",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string", description: "New commitments content" },
      },
      required: ["content"],
    },
  },
  {
    name: "get_core_memory",
    description:
      "Read core memory (1_core/). Returns persona, values, owner context, system guide, communication style.",
    inputSchema: { type: "object", properties: {} },
  },
  // Project tools
  {
    name: "list_projects",
    description: "List all project names",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_project",
    description: "Read a project file",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Project name" },
      },
      required: ["name"],
    },
  },
  {
    name: "set_project",
    description: "Create or update a project file",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Project name" },
        content: { type: "string", description: "Project content" },
      },
      required: ["name", "content"],
    },
  },
  // Calendar tools
  {
    name: "calendar_events",
    description:
      "List calendar events in a date range. Returns events from all configured calendars.",
    inputSchema: {
      type: "object",
      properties: {
        start_date: {
          type: "string",
          description: "Start date (ISO format). Defaults to now.",
        },
        end_date: {
          type: "string",
          description: "End date (ISO format). Defaults to 7 days from now.",
        },
      },
    },
  },
  {
    name: "calendar_event_details",
    description: "Get full details of a specific calendar event.",
    inputSchema: {
      type: "object",
      properties: {
        event_id: { type: "string", description: "The event ID" },
        calendar_id: {
          type: "string",
          description: "The calendar ID the event belongs to",
        },
      },
      required: ["event_id", "calendar_id"],
    },
  },
  {
    name: "calendar_create_event",
    description: "Create a new calendar event.",
    inputSchema: {
      type: "object",
      properties: {
        summary: { type: "string", description: "Event title" },
        start: { type: "string", description: "Start datetime (ISO format)" },
        end: { type: "string", description: "End datetime (ISO format)" },
        description: { type: "string", description: "Event description" },
        location: { type: "string", description: "Event location" },
        calendar_id: {
          type: "string",
          description: "Calendar ID (defaults to first configured)",
        },
      },
      required: ["summary", "start", "end"],
    },
  },
  {
    name: "calendar_availability",
    description: "Check free/busy times across all calendars.",
    inputSchema: {
      type: "object",
      properties: {
        start_date: { type: "string", description: "Start date (ISO format)" },
        end_date: { type: "string", description: "End date (ISO format)" },
      },
      required: ["start_date", "end_date"],
    },
  },
  // GitHub tools
  {
    name: "github_prs",
    description: "List open pull requests. Optionally filter by repo.",
    inputSchema: {
      type: "object",
      properties: {
        repo: {
          type: "string",
          description: "Filter to specific repo (e.g., 'owner/repo')",
        },
      },
    },
  },
  {
    name: "github_issues",
    description:
      "List open issues assigned to you. Optionally filter by repo.",
    inputSchema: {
      type: "object",
      properties: {
        repo: {
          type: "string",
          description: "Filter to specific repo (e.g., 'owner/repo')",
        },
      },
    },
  },
  {
    name: "github_pr_details",
    description: "Get details of a specific pull request",
    inputSchema: {
      type: "object",
      properties: {
        repo: {
          type: "string",
          description: "Repository (e.g., 'owner/repo')",
        },
        pr_number: { type: "number", description: "PR number" },
      },
      required: ["repo", "pr_number"],
    },
  },
  {
    name: "github_notifications",
    description: "Check unread GitHub notifications",
    inputSchema: { type: "object", properties: {} },
  },
  // Skills tools
  {
    name: "invoke_skill",
    description:
      "Load and read a skill's full content. Use this to get instructions for a specific skill.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Skill name (e.g., 'sync-state', 'self-improve')",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "list_skills",
    description: "List all available skills",
    inputSchema: { type: "object", properties: {} },
  },
  // Discord tools
  {
    name: "send_message",
    description:
      "Send a message to the user via Discord. Use this to communicate with your owner. You can call this multiple times to send multiple messages.",
    inputSchema: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "The message content to send (max 2000 characters)",
        },
      },
      required: ["content"],
    },
  },
];

// Tool handlers
async function handleTool(
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  switch (name) {
    // Working memory tools
    case "get_focus": {
      const content = getFocus();
      appendJournal({ type: "read", target: "focus" });
      return content || "(no focus set)";
    }

    case "set_focus": {
      setFocus(args.content as string);
      appendJournal({
        type: "update",
        target: "focus",
        preview: (args.content as string).slice(0, 100),
      });
      return "Updated focus";
    }

    case "get_inbox": {
      const content = getInbox();
      appendJournal({ type: "read", target: "inbox" });
      return content || "(inbox empty)";
    }

    case "set_inbox": {
      setInbox(args.content as string);
      appendJournal({
        type: "update",
        target: "inbox",
        preview: (args.content as string).slice(0, 100),
      });
      return "Updated inbox";
    }

    case "get_commitments": {
      const content = getCommitments();
      appendJournal({ type: "read", target: "commitments" });
      return content || "(no commitments)";
    }

    case "set_commitments": {
      setCommitments(args.content as string);
      appendJournal({
        type: "update",
        target: "commitments",
        preview: (args.content as string).slice(0, 100),
      });
      return "Updated commitments";
    }

    case "get_core_memory": {
      const core = loadCoreMemory();
      const sections: string[] = [];
      if (core.persona) sections.push(`## Persona\n${core.persona}`);
      if (core.values) sections.push(`## Values\n${core.values}`);
      if (core.owner_context)
        sections.push(`## Owner Context\n${core.owner_context}`);
      if (core.system_guide)
        sections.push(`## System Guide\n${core.system_guide}`);
      if (core.communication)
        sections.push(`## Communication\n${core.communication}`);
      return sections.join("\n\n") || "(core memory empty)";
    }

    // Project tools
    case "list_projects": {
      const projects = listProjectNames();
      return projects.length > 0 ? projects.join("\n") : "(no projects)";
    }

    case "get_project": {
      const content = getProjectContent(args.name as string);
      if (!content) {
        return `Project '${args.name}' not found`;
      }
      appendJournal({ type: "read", target: `project:${args.name}` });
      return content;
    }

    case "set_project": {
      saveProjectContent(args.name as string, args.content as string);
      appendJournal({
        type: "update",
        target: `project:${args.name}`,
        preview: (args.content as string).slice(0, 100),
      });
      return `Updated project '${args.name}'`;
    }

    // Calendar tools
    case "calendar_events": {
      if (config.calendar.calendarIds.length === 0) {
        return "Calendar not configured (no GOOGLE_CALENDAR_IDS)";
      }
      const now = new Date();
      const startDate = args.start_date
        ? new Date(args.start_date as string)
        : now;
      const endDate = args.end_date
        ? new Date(args.end_date as string)
        : new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const events = await listEvents(startDate, endDate);
      if (events.length === 0) {
        return "No events found in date range";
      }
      return events.map((e) => formatEventForDisplay(e)).join("\n");
    }

    case "calendar_event_details": {
      if (config.calendar.calendarIds.length === 0) {
        return "Calendar not configured";
      }
      const event = await getEvent(
        args.calendar_id as string,
        args.event_id as string
      );
      if (!event) {
        return "Event not found";
      }
      return [
        `**${event.summary}**`,
        `Calendar: ${event.calendarName}`,
        `Start: ${event.start}`,
        `End: ${event.end}`,
        event.location ? `Location: ${event.location}` : null,
        event.description ? `Description: ${event.description}` : null,
        event.attendees?.length
          ? `Attendees: ${event.attendees.join(", ")}`
          : null,
      ]
        .filter(Boolean)
        .join("\n");
    }

    case "calendar_create_event": {
      if (config.calendar.calendarIds.length === 0) {
        return "Calendar not configured";
      }
      const event = await createEvent({
        summary: args.summary as string,
        start: args.start as string,
        end: args.end as string,
        description: args.description as string | undefined,
        location: args.location as string | undefined,
        calendarId: args.calendar_id as string | undefined,
      });
      if (!event) {
        return "Failed to create event";
      }
      return `Created event: ${formatEventForDisplay(event)}`;
    }

    case "calendar_availability": {
      if (config.calendar.calendarIds.length === 0) {
        return "Calendar not configured";
      }
      const busySlots = await getFreeBusy(
        new Date(args.start_date as string),
        new Date(args.end_date as string)
      );
      if (busySlots.length === 0) {
        return "You appear to be free during this time range";
      }
      return busySlots
        .map((slot) => `Busy: ${slot.start} - ${slot.end}`)
        .join("\n");
    }

    // GitHub tools
    case "github_prs": {
      const token = config.github.token;
      if (!token) {
        return "GitHub not configured (no GITHUB_TOKEN)";
      }
      const repos = getGithubRepos().map((r) => `${r.owner}/${r.repo}`);
      const reposToCheck = args.repo ? [args.repo as string] : repos;
      if (reposToCheck.length === 0) {
        return "No repos configured";
      }
      const results: string[] = [];
      for (const repo of reposToCheck) {
        const prs = await listPRs(repo, token);
        if (prs.length > 0) {
          results.push(`**${repo}:**`);
          prs.forEach((pr) => results.push(`  - ${formatPRForDisplay(pr)}`));
        }
      }
      return results.length > 0 ? results.join("\n") : "No open PRs found";
    }

    case "github_issues": {
      const token = config.github.token;
      if (!token) {
        return "GitHub not configured (no GITHUB_TOKEN)";
      }
      const repos = getGithubRepos().map((r) => `${r.owner}/${r.repo}`);
      const reposToCheck = args.repo ? [args.repo as string] : repos;
      if (reposToCheck.length === 0) {
        return "No repos configured";
      }
      const results: string[] = [];
      for (const repo of reposToCheck) {
        const issues = await listIssues(repo, token);
        if (issues.length > 0) {
          results.push(`**${repo}:**`);
          issues.forEach((issue) =>
            results.push(`  - ${formatIssueForDisplay(issue)}`)
          );
        }
      }
      return results.length > 0
        ? results.join("\n")
        : "No open issues assigned to you";
    }

    case "github_pr_details": {
      const token = config.github.token;
      if (!token) {
        return "GitHub not configured (no GITHUB_TOKEN)";
      }
      const pr = await getPRDetails(
        args.repo as string,
        args.pr_number as number,
        token
      );
      if (!pr) {
        return `PR #${args.pr_number} not found in ${args.repo}`;
      }
      return [
        `**${pr.title}** (#${pr.number})`,
        `Author: ${pr.author.login}`,
        `State: ${pr.state}`,
        `URL: ${pr.url}`,
      ].join("\n");
    }

    case "github_notifications": {
      const token = config.github.token;
      if (!token) {
        return "GitHub not configured (no GITHUB_TOKEN)";
      }
      const notifications = await getNotifications(token);
      if (notifications.length === 0) {
        return "No unread notifications";
      }
      return notifications
        .slice(0, 10)
        .map(
          (n) =>
            `- [${n.repository.full_name}] ${n.subject.type}: ${n.subject.title}`
        )
        .join("\n");
    }

    // Skills tools
    case "invoke_skill": {
      const content = getSkillContent(args.name as string);
      if (!content) {
        return `Skill '${args.name}' not found. Use list_skills to see available skills.`;
      }
      return content;
    }

    case "list_skills": {
      const skills = listSkillNames();
      return skills.length > 0 ? skills.join("\n") : "(no skills available)";
    }

    // Discord tools
    case "send_message": {
      const discordToken = config.discord.token;
      const channelId = config.discord.channelId;

      if (!discordToken || !channelId) {
        return "Discord not configured (missing DISCORD_TOKEN or DISCORD_CHANNEL_ID)";
      }

      const content = args.content as string;
      if (!content || content.trim().length === 0) {
        return "Cannot send empty message";
      }

      // Discord has a 2000 character limit
      const truncated =
        content.length > 2000 ? content.slice(0, 1997) + "..." : content;

      const result = await sendMessage({
        token: discordToken,
        channelId,
        content: truncated,
      });

      if (result.success) {
        appendJournal({
          type: "message_sent",
          content: truncated.slice(0, 100),
          message_id: result.messageId,
        });
        return `Message sent successfully (${truncated.length} chars)`;
      } else {
        return `Failed to send message: ${result.error}`;
      }
    }

    default:
      return `Unknown tool: ${name}`;
  }
}

// JSON-RPC response helper
function sendResponse(id: number | string | null, result: unknown) {
  const response = {
    jsonrpc: "2.0",
    id,
    result,
  };
  console.log(JSON.stringify(response));
}

function sendError(
  id: number | string | null,
  code: number,
  message: string
) {
  const response = {
    jsonrpc: "2.0",
    id,
    error: { code, message },
  };
  console.log(JSON.stringify(response));
}

// Handle JSON-RPC requests
async function handleRequest(request: {
  jsonrpc: string;
  id?: number | string;
  method: string;
  params?: unknown;
}) {
  const id = request.id ?? null;

  try {
    switch (request.method) {
      case "initialize":
        sendResponse(id, {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "bud-tools", version: "1.0.0" },
        });
        break;

      case "tools/list":
        sendResponse(id, { tools });
        break;

      case "tools/call": {
        const params = request.params as {
          name: string;
          arguments?: Record<string, unknown>;
        };
        const result = await handleTool(params.name, params.arguments || {});
        sendResponse(id, {
          content: [{ type: "text", text: result }],
        });
        break;
      }

      case "notifications/initialized":
        // No response needed for notifications
        break;

      default:
        sendError(id, -32601, `Method not found: ${request.method}`);
    }
  } catch (error) {
    sendError(
      id,
      -32603,
      `Internal error: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// Main entry point
async function main() {
  console.error("[bud-mcp] Server started");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  rl.on("line", async (line) => {
    try {
      const request = JSON.parse(line);
      await handleRequest(request);
    } catch (error) {
      console.error("[bud-mcp] Parse error:", error);
      sendError(null, -32700, "Parse error");
    }
  });

  rl.on("close", () => {
    console.error("[bud-mcp] Server stopped");
    process.exit(0);
  });
}

main().catch((error) => {
  console.error("[bud-mcp] Fatal error:", error);
  process.exit(1);
});
