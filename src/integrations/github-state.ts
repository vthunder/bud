import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { dirname } from "path";

export interface GitHubState {
  lastCheck: string;
  seen: Record<string, string>; // key: "repo#type-number", value: ISO timestamp
}

const PRUNE_DAYS = 7;

export async function loadGitHubState(filepath: string): Promise<GitHubState> {
  if (!existsSync(filepath)) {
    return { lastCheck: "", seen: {} };
  }

  try {
    const content = await readFile(filepath, "utf-8");
    return JSON.parse(content) as GitHubState;
  } catch {
    return { lastCheck: "", seen: {} };
  }
}

export async function saveGitHubState(filepath: string, state: GitHubState): Promise<void> {
  const dir = dirname(filepath);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  await writeFile(filepath, JSON.stringify(state, null, 2), "utf-8");
}

export function isItemSeen(state: GitHubState, itemKey: string): boolean {
  return itemKey in state.seen;
}

export function markItemSeen(state: GitHubState, itemKey: string): GitHubState {
  return {
    ...state,
    seen: {
      ...state.seen,
      [itemKey]: new Date().toISOString(),
    },
  };
}

export function pruneOldEntries(state: GitHubState, now: Date = new Date()): GitHubState {
  const cutoff = now.getTime() - PRUNE_DAYS * 24 * 60 * 60 * 1000;

  const prunedSeen: Record<string, string> = {};
  for (const [key, timestamp] of Object.entries(state.seen)) {
    if (new Date(timestamp).getTime() > cutoff) {
      prunedSeen[key] = timestamp;
    }
  }

  return {
    ...state,
    seen: prunedSeen,
  };
}

export function makeItemKey(repo: string, type: "pr" | "issue", number: number): string {
  return `${repo}#${type}-${number}`;
}
