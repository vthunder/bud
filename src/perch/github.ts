import { config } from "../config";
import { listPRs, listIssues, formatPRForDisplay, formatIssueForDisplay, type GitHubPR, type GitHubIssue } from "../integrations/github";
import { loadGitHubState, saveGitHubState, isItemSeen, markItemSeen, pruneOldEntries, makeItemKey, type GitHubState } from "../integrations/github-state";

const STATE_FILE = "./state/github-seen.json";

export interface NewItems {
  prs: GitHubPR[];
  issues: GitHubIssue[];
}

export interface GitHubActivity {
  [repo: string]: NewItems;
}

export function identifyNewItems(
  repo: string,
  prs: GitHubPR[],
  issues: GitHubIssue[],
  state: GitHubState
): NewItems {
  const newPRs = prs.filter((pr) => !isItemSeen(state, makeItemKey(repo, "pr", pr.number)));
  const newIssues = issues.filter((issue) => !isItemSeen(state, makeItemKey(repo, "issue", issue.number)));

  return { prs: newPRs, issues: newIssues };
}

export function formatGitHubSummary(activity: GitHubActivity): string {
  const lines: string[] = [];

  for (const [repo, items] of Object.entries(activity)) {
    if (items.prs.length === 0 && items.issues.length === 0) continue;

    lines.push(`**${repo}:**`);
    items.prs.forEach((pr) => lines.push(`  - ${formatPRForDisplay(pr)}`));
    items.issues.forEach((issue) => lines.push(`  - ${formatIssueForDisplay(issue)}`));
  }

  return lines.join("\n");
}

export async function checkGitHubActivity(repos: string[]): Promise<{ activity: GitHubActivity; summary: string; hasNew: boolean }> {
  const token = config.github.token;

  if (!token || repos.length === 0) {
    return { activity: {}, summary: "", hasNew: false };
  }

  let state = await loadGitHubState(STATE_FILE);
  const activity: GitHubActivity = {};
  let hasNew = false;

  for (const repo of repos) {
    const prs = await listPRs(repo, token);
    const issues = await listIssues(repo, token);

    const newItems = identifyNewItems(repo, prs, issues, state);

    if (newItems.prs.length > 0 || newItems.issues.length > 0) {
      activity[repo] = newItems;
      hasNew = true;

      // Mark items as seen
      newItems.prs.forEach((pr) => {
        state = markItemSeen(state, makeItemKey(repo, "pr", pr.number));
      });
      newItems.issues.forEach((issue) => {
        state = markItemSeen(state, makeItemKey(repo, "issue", issue.number));
      });
    }
  }

  // Prune old entries and save
  state = pruneOldEntries(state);
  state.lastCheck = new Date().toISOString();
  await saveGitHubState(STATE_FILE, state);

  const summary = formatGitHubSummary(activity);
  return { activity, summary, hasNew };
}
