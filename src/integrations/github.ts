import { $ } from "bun";

export interface GitHubPR {
  number: number;
  title: string;
  author: { login: string };
  state: string;
  url: string;
  createdAt: string;
  updatedAt: string;
}

export interface GitHubIssue {
  number: number;
  title: string;
  state: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  assignees: { login: string }[];
}

export function parseGitHubRepoList(repoString: string): string[] {
  if (!repoString.trim()) return [];
  return repoString.split(",").map((r) => r.trim()).filter(Boolean);
}

export function formatPRForDisplay(pr: GitHubPR): string {
  return `PR #${pr.number}: ${pr.title} (by ${pr.author.login})`;
}

export function formatIssueForDisplay(issue: GitHubIssue): string {
  return `Issue #${issue.number}: ${issue.title}`;
}

export async function listPRs(repo: string, token: string): Promise<GitHubPR[]> {
  try {
    const result = await $`gh pr list --repo ${repo} --json number,title,author,state,url,createdAt,updatedAt --limit 20`
      .env({ GITHUB_TOKEN: token })
      .quiet();
    return JSON.parse(result.stdout.toString());
  } catch (error) {
    console.error(`[github] Failed to list PRs for ${repo}:`, error);
    return [];
  }
}

export async function listIssues(repo: string, token: string): Promise<GitHubIssue[]> {
  try {
    const result = await $`gh issue list --repo ${repo} --assignee @me --json number,title,state,url,createdAt,updatedAt,assignees --limit 20`
      .env({ GITHUB_TOKEN: token })
      .quiet();
    return JSON.parse(result.stdout.toString());
  } catch (error) {
    console.error(`[github] Failed to list issues for ${repo}:`, error);
    return [];
  }
}

export async function getPRDetails(repo: string, prNumber: number, token: string): Promise<GitHubPR | null> {
  try {
    const result = await $`gh pr view ${prNumber} --repo ${repo} --json number,title,author,state,url,createdAt,updatedAt,body,additions,deletions,changedFiles`
      .env({ GITHUB_TOKEN: token })
      .quiet();
    return JSON.parse(result.stdout.toString());
  } catch (error) {
    console.error(`[github] Failed to get PR #${prNumber} for ${repo}:`, error);
    return null;
  }
}

export async function getNotifications(token: string): Promise<any[]> {
  try {
    const result = await $`gh api notifications --paginate`
      .env({ GITHUB_TOKEN: token })
      .quiet();
    return JSON.parse(result.stdout.toString());
  } catch (error) {
    console.error("[github] Failed to get notifications:", error);
    return [];
  }
}
