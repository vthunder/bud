import { readLogs, type LogEntry } from "../memory/logs";
import { loadCoreMemory, type CoreMemory } from "../memory/core";
import { getFocus } from "../memory/working";
import { getScheduledTasks, getGithubRepos } from "../memory/long_term";
import { getDueTasks, type ScheduledTask } from "./tasks";
import { checkGitHubActivity } from "./github";
import { getCalendarContext } from "./calendar";

export interface BudContext {
  persona: string;
  currentFocus: string;
  ownerContext: string;
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
  const core = loadCoreMemory();
  return {
    persona: core.persona,
    currentFocus: getFocus(),
    ownerContext: core.owner_context,
  };
}

export async function gatherPerchContext(
  options: GatherContextOptions = {}
): Promise<PerchContext> {
  const now = options.now ?? new Date();
  const lookbackHours = options.lookbackHours ?? 24;
  const cutoff = new Date(now.getTime() - lookbackHours * 60 * 60 * 1000);

  // Load memory from files
  const memory = loadContext();

  // Load and check scheduled tasks
  const allTasks = getScheduledTasks();
  const dueTasks = getDueTasks(allTasks, now);

  // Load GitHub repos from long-term memory
  const githubRepos = getGithubRepos().map((r) => `${r.owner}/${r.repo}`);

  // Check GitHub activity
  const { summary: githubSummary, hasNew: hasNewGitHub } =
    await checkGitHubActivity(githubRepos);

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
    const lastTimestamp =
      recentInteractions[recentInteractions.length - 1].timestamp;
    const lastTime = new Date(lastTimestamp);
    hoursSinceLastInteraction =
      (now.getTime() - lastTime.getTime()) / (1000 * 60 * 60);
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
