import type Letta from "@letta-ai/letta-client";
import { readLogs, type LogEntry } from "../memory/logs";
import { loadContext, getMemoryBlock, type BudContext } from "../memory/letta";
import { parseTasksJson, getDueTasks, type ScheduledTask } from "./tasks";
import { checkGitHubActivity } from "./github";

export interface PerchContext {
  currentTime: string;
  hourOfDay: number;
  dayOfWeek: string;
  memory: BudContext;
  recentInteractions: LogEntry[];
  hoursSinceLastInteraction: number | null;
  dueTasks: ScheduledTask[];
  githubSummary: string;
  hasNewGitHub: boolean;
}

export interface GatherContextOptions {
  lettaClient: Letta;
  agentId: string;
  now?: Date;
  lookbackHours?: number;
}

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export async function gatherPerchContext(
  options: GatherContextOptions
): Promise<PerchContext> {
  const now = options.now ?? new Date();
  const lookbackHours = options.lookbackHours ?? 24;
  const cutoff = new Date(now.getTime() - lookbackHours * 60 * 60 * 1000);

  // Load Letta memory
  const memory = await loadContext(options.lettaClient, options.agentId);

  // Load and check scheduled tasks
  const tasksJson = await getMemoryBlock(options.lettaClient, options.agentId, "scheduled_tasks");
  const allTasks = parseTasksJson(tasksJson);
  const dueTasks = getDueTasks(allTasks, now);

  // Check GitHub activity
  const { summary: githubSummary, hasNew: hasNewGitHub } = await checkGitHubActivity();

  // Read recent journal entries
  const allLogs = await readLogs("journal.jsonl");
  const recentInteractions = allLogs.filter(
    (log) => new Date(log.timestamp) >= cutoff
  );

  // Calculate hours since last interaction
  let hoursSinceLastInteraction: number | null = null;
  if (recentInteractions.length > 0) {
    const lastTimestamp = recentInteractions[recentInteractions.length - 1].timestamp;
    const lastTime = new Date(lastTimestamp);
    hoursSinceLastInteraction = (now.getTime() - lastTime.getTime()) / (1000 * 60 * 60);
  }

  return {
    currentTime: now.toISOString(),
    hourOfDay: now.getUTCHours(),
    dayOfWeek: DAYS[now.getUTCDay()],
    memory,
    recentInteractions,
    hoursSinceLastInteraction,
    dueTasks,
    githubSummary,
    hasNewGitHub,
  };
}
