import { randomUUID } from "crypto";

export interface ScheduledTask {
  id: string;
  description: string;
  timing: string; // ISO 8601 for exact, or "daily" | "weekly" | "monthly" | "hourly"
  requiresWakeup: boolean;
  lastRun: string | null; // ISO 8601 timestamp of last execution
  context?: string; // Additional context for the LLM
}

export function parseTasksJson(json: string): ScheduledTask[] {
  if (!json || json.trim() === "") {
    return [];
  }
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed as ScheduledTask[];
  } catch {
    return [];
  }
}

export function serializeTasksJson(tasks: ScheduledTask[]): string {
  return JSON.stringify(tasks, null, 2);
}

/**
 * Check if a timing string is a recurring schedule vs exact time
 */
function isRecurring(timing: string): boolean {
  return ["hourly", "daily", "weekly", "monthly"].includes(timing.toLowerCase());
}

/**
 * Get the interval in milliseconds for a recurring timing
 */
function getRecurringInterval(timing: string): number {
  switch (timing.toLowerCase()) {
    case "hourly":
      return 60 * 60 * 1000;
    case "daily":
      return 24 * 60 * 60 * 1000;
    case "weekly":
      return 7 * 24 * 60 * 60 * 1000;
    case "monthly":
      return 30 * 24 * 60 * 60 * 1000; // Approximate
    default:
      return 24 * 60 * 60 * 1000; // Default to daily
  }
}

/**
 * Check if a task is due based on its timing and lastRun
 */
export function isTaskDue(task: ScheduledTask, now: Date = new Date()): boolean {
  if (isRecurring(task.timing)) {
    // Recurring task: due if never run, or interval has passed since lastRun
    if (!task.lastRun) {
      return true;
    }
    const lastRunTime = new Date(task.lastRun).getTime();
    const interval = getRecurringInterval(task.timing);
    return now.getTime() - lastRunTime >= interval;
  } else {
    // Exact time: due if the time has passed
    const dueTime = new Date(task.timing);
    return dueTime <= now;
  }
}

/**
 * Get all tasks that are currently due
 */
export function getDueTasks(tasks: ScheduledTask[], now: Date = new Date()): ScheduledTask[] {
  return tasks.filter((task) => isTaskDue(task, now));
}

/**
 * Get tasks that are due AND require a wake-up
 */
export function getWakeupTasks(tasks: ScheduledTask[], now: Date = new Date()): ScheduledTask[] {
  return tasks.filter((task) => task.requiresWakeup && isTaskDue(task, now));
}

/**
 * Create a new scheduled task
 */
export function createTask(
  description: string,
  timing: string,
  requiresWakeup: boolean = true,
  context?: string
): ScheduledTask {
  // Handle relative times like "30m", "2h", "1d" - convert to absolute
  const relativeMatch = timing.match(/^(\d+)(m|h|d)$/);
  if (relativeMatch) {
    const amount = parseInt(relativeMatch[1], 10);
    const unit = relativeMatch[2];
    const ms =
      unit === "m" ? amount * 60 * 1000 :
      unit === "h" ? amount * 60 * 60 * 1000 :
      amount * 24 * 60 * 60 * 1000;
    timing = new Date(Date.now() + ms).toISOString();
  }

  return {
    id: randomUUID(),
    description,
    timing,
    requiresWakeup,
    lastRun: null,
    context,
  };
}

/**
 * Mark a task as run (updates lastRun timestamp)
 */
export function markTaskRun(task: ScheduledTask, now: Date = new Date()): ScheduledTask {
  return {
    ...task,
    lastRun: now.toISOString(),
  };
}

/**
 * Remove a task by ID (for one-off tasks after completion)
 */
export function removeTask(tasks: ScheduledTask[], taskId: string): ScheduledTask[] {
  return tasks.filter((t) => t.id !== taskId);
}

/**
 * Check if a task is one-off (exact time, not recurring)
 */
export function isOneOffTask(task: ScheduledTask): boolean {
  return !isRecurring(task.timing);
}
