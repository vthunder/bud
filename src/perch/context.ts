import { readLogs, type LogEntry } from "../memory/logs";
import { getBlock } from "../memory/blocks";
import { parseTasksJson, getDueTasks, type ScheduledTask } from "./tasks";
import { checkGitHubActivity } from "./github";
import { parseReposJson } from "../integrations/github";
import { getCalendarContext } from "./calendar";

export interface BudContext {
  persona: string;
  currentFocus: string;
  ownerContext: string;
  timezone: string;
}

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
  calendarSummary: string;
}

export interface GatherContextOptions {
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

function loadContext(): BudContext {
  return {
    persona: getBlock("persona") ?? "",
    currentFocus: getBlock("current_focus") ?? "",
    ownerContext: getBlock("owner_context") ?? "",
    timezone: getBlock("timezone") ?? "",
  };
}

export async function gatherPerchContext(
  options: GatherContextOptions = {}
): Promise<PerchContext> {
  const now = options.now ?? new Date();
  const lookbackHours = options.lookbackHours ?? 24;
  const cutoff = new Date(now.getTime() - lookbackHours * 60 * 60 * 1000);

  // Load memory from SQLite
  const memory = loadContext();

  // Load and check scheduled tasks
  const tasksJson = getBlock("scheduled_tasks") ?? "[]";
  const allTasks = parseTasksJson(tasksJson);
  const dueTasks = getDueTasks(allTasks, now);

  // Load GitHub repos from memory
  const reposJson = getBlock("github_repos") ?? "[]";
  const githubRepos = parseReposJson(reposJson);

  // Check GitHub activity
  const { summary: githubSummary, hasNew: hasNewGitHub } = await checkGitHubActivity(githubRepos);

  // Get calendar context
  const { summary: calendarSummary } = await getCalendarContext();

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
    calendarSummary,
  };
}
