#!/usr/bin/env bun
/**
 * Standalone MCP Server for Bud
 *
 * This is a stdio-based MCP server using raw JSON-RPC.
 * It hosts all the custom tools (memory, calendar, github, skills).
 *
 * Run with: bun run src/mcp-server.ts
 */

import { config, getDbPath, getJournalPath } from "./config";
import {
  initDatabase,
  getBlock,
  setBlock,
  getAllCurrentBlocks,
  getBlockHistory,
} from "./memory/blocks";
import { initJournal, appendJournal } from "./memory/journal";
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
  parseReposJson,
} from "./integrations/github";
import { readFile, readdir } from "fs/promises";
import { join } from "path";
import * as readline from "readline";

// Initialize database and journal
initDatabase(getDbPath());
initJournal(getJournalPath());

// Load GitHub repos from working memory
function getGitHubRepos(): string[] {
  try {
    const reposJson = getBlock("github_repos") || "[]";
    return parseReposJson(reposJson);
  } catch {
    return [];
  }
}

// Tool definitions
const tools = [
  // Memory tools
  {
    name: "get_block",
    description:
      "Read a memory block. Layers: 2=identity (persona, values), 3=semantic (owner_context, patterns), 4=working (focus, goals, schedule)",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Block name (e.g., 'persona', 'focus', 'owner_context')",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "set_block",
    description:
      "Update a memory block. Creates new version (old versions preserved). Layer 4 for working state, 3 for learned patterns.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Block name" },
        value: { type: "string", description: "New content" },
        layer: {
          type: "number",
          description: "Layer: 2=identity, 3=semantic, 4=working (default)",
        },
      },
      required: ["name", "value"],
    },
  },
  {
    name: "list_blocks",
    description: "List all memory blocks with their current values",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "block_history",
    description:
      "Get version history of a memory block for recovery or analysis",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Block name" },
        limit: {
          type: "number",
          description: "Max versions to return (default 10)",
        },
      },
      required: ["name"],
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
    description: "List all available skills with their descriptions",
    inputSchema: { type: "object", properties: {} },
  },
];

// Tool handlers
async function handleTool(
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  switch (name) {
    // Memory tools
    case "get_block": {
      const value = getBlock(args.name as string);
      await appendJournal({ type: "read", target: `block:${args.name}` });
      return value ?? `(block '${args.name}' not found)`;
    }

    case "set_block": {
      const layer = (args.layer as number) ?? 4;
      if (layer === 2) {
        return "Cannot modify identity blocks (layer 2). These require owner approval.";
      }
      setBlock(args.name as string, args.value as string, layer);
      await appendJournal({
        type: "block_update",
        block: args.name,
        layer,
        preview: (args.value as string).slice(0, 100),
      });
      return `Updated block '${args.name}'`;
    }

    case "list_blocks": {
      const blocks = getAllCurrentBlocks();
      const list = Object.entries(blocks)
        .map(
          ([name, value]) =>
            `${name}: ${value.slice(0, 100)}${value.length > 100 ? "..." : ""}`
        )
        .join("\n");
      return list || "(no blocks)";
    }

    case "block_history": {
      const history = getBlockHistory(args.name as string);
      const limited = history.slice(-((args.limit as number) ?? 10));
      const formatted = limited
        .map(
          (h) =>
            `[${h.created_at}] ${h.value.slice(0, 80)}${h.value.length > 80 ? "..." : ""}`
        )
        .join("\n");
      return formatted || `(no history for '${args.name}')`;
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
      const repos = getGitHubRepos();
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
      const repos = getGitHubRepos();
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
      try {
        const skillPath = join(config.skills.path, `${args.name}.md`);
        return await readFile(skillPath, "utf-8");
      } catch {
        return `Skill '${args.name}' not found. Available skills can be seen in the Available Skills section of your prompt.`;
      }
    }

    case "list_skills": {
      try {
        const files = await readdir(config.skills.path);
        const mdFiles = files.filter((f) => f.endsWith(".md"));
        const skills: string[] = [];
        for (const file of mdFiles) {
          const name = file.replace(".md", "");
          const content = await readFile(
            join(config.skills.path, file),
            "utf-8"
          );
          const firstLine = content.split("\n")[0].replace(/^#\s*/, "");
          skills.push(`- ${name}: ${firstLine}`);
        }
        return skills.length > 0 ? skills.join("\n") : "(no skills available)";
      } catch {
        return "(error reading skills)";
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
