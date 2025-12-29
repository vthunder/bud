import { z } from "zod";
import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { config } from "../config";
import {
  listPRs,
  listIssues,
  getPRDetails,
  getNotifications,
  formatPRForDisplay,
  formatIssueForDisplay,
} from "../integrations/github";

export function createGitHubToolsServer() {
  const token = config.github.token;

  const githubPRsTool = tool(
    "github_prs",
    "List open pull requests. Optionally filter by repo.",
    {
      repo: z.string().optional().describe("Filter to specific repo (e.g., 'owner/repo')"),
    },
    async (args) => {
      if (!token) {
        return { content: [{ type: "text" as const, text: "GitHub not configured (no GITHUB_TOKEN)" }] };
      }

      try {
        const repos = args.repo ? [args.repo] : config.github.repos;
        if (repos.length === 0) {
          return { content: [{ type: "text" as const, text: "No repos configured" }] };
        }

        const results: string[] = [];
        for (const repo of repos) {
          const prs = await listPRs(repo, token);
          if (prs.length > 0) {
            results.push(`**${repo}:**`);
            prs.forEach((pr) => results.push(`  - ${formatPRForDisplay(pr)}`));
          }
        }

        if (results.length === 0) {
          return { content: [{ type: "text" as const, text: "No open PRs found" }] };
        }

        return { content: [{ type: "text" as const, text: results.join("\n") }] };
      } catch (error) {
        return {
          content: [{
            type: "text" as const,
            text: `Error listing PRs: ${error}`,
          }],
        };
      }
    }
  );

  const githubIssuesTool = tool(
    "github_issues",
    "List open issues assigned to you. Optionally filter by repo.",
    {
      repo: z.string().optional().describe("Filter to specific repo (e.g., 'owner/repo')"),
    },
    async (args) => {
      if (!token) {
        return { content: [{ type: "text" as const, text: "GitHub not configured (no GITHUB_TOKEN)" }] };
      }

      try {
        const repos = args.repo ? [args.repo] : config.github.repos;
        if (repos.length === 0) {
          return { content: [{ type: "text" as const, text: "No repos configured" }] };
        }

        const results: string[] = [];
        for (const repo of repos) {
          const issues = await listIssues(repo, token);
          if (issues.length > 0) {
            results.push(`**${repo}:**`);
            issues.forEach((issue) => results.push(`  - ${formatIssueForDisplay(issue)}`));
          }
        }

        if (results.length === 0) {
          return { content: [{ type: "text" as const, text: "No open issues assigned to you" }] };
        }

        return { content: [{ type: "text" as const, text: results.join("\n") }] };
      } catch (error) {
        return {
          content: [{
            type: "text" as const,
            text: `Error listing issues: ${error}`,
          }],
        };
      }
    }
  );

  const githubPRDetailsTool = tool(
    "github_pr_details",
    "Get details of a specific pull request",
    {
      repo: z.string().describe("Repository (e.g., 'owner/repo')"),
      pr_number: z.number().describe("PR number"),
    },
    async (args) => {
      if (!token) {
        return { content: [{ type: "text" as const, text: "GitHub not configured (no GITHUB_TOKEN)" }] };
      }

      try {
        const pr = await getPRDetails(args.repo, args.pr_number, token);
        if (!pr) {
          return { content: [{ type: "text" as const, text: `PR #${args.pr_number} not found in ${args.repo}` }] };
        }

        const details = [
          `**${pr.title}** (#${pr.number})`,
          `Author: ${pr.author.login}`,
          `State: ${pr.state}`,
          `URL: ${pr.url}`,
        ];

        return { content: [{ type: "text" as const, text: details.join("\n") }] };
      } catch (error) {
        return {
          content: [{
            type: "text" as const,
            text: `Error getting PR details: ${error}`,
          }],
        };
      }
    }
  );

  const githubNotificationsTool = tool(
    "github_notifications",
    "Check unread GitHub notifications",
    {},
    async () => {
      if (!token) {
        return { content: [{ type: "text" as const, text: "GitHub not configured (no GITHUB_TOKEN)" }] };
      }

      try {
        const notifications = await getNotifications(token);
        if (notifications.length === 0) {
          return { content: [{ type: "text" as const, text: "No unread notifications" }] };
        }

        const items = notifications.slice(0, 10).map((n) =>
          `- [${n.repository.full_name}] ${n.subject.type}: ${n.subject.title}`
        );

        return { content: [{ type: "text" as const, text: items.join("\n") }] };
      } catch (error) {
        return {
          content: [{
            type: "text" as const,
            text: `Error getting notifications: ${error}`,
          }],
        };
      }
    }
  );

  return createSdkMcpServer({
    name: "github",
    version: "1.0.0",
    tools: [githubPRsTool, githubIssuesTool, githubPRDetailsTool, githubNotificationsTool],
  });
}

export const GITHUB_TOOL_NAMES = [
  "mcp__github__github_prs",
  "mcp__github__github_issues",
  "mcp__github__github_pr_details",
  "mcp__github__github_notifications",
];
