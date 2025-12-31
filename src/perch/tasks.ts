import { randomUUID } from "crypto";

export interface ScheduledTask {
  id: string;
  description: string;
  dueAt: string; // ISO 8601
  recurring?: "daily" | "weekly" | "monthly";
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
  return JSON.stringify(tasks);
}

export function getDueTasks(tasks: ScheduledTask[], now: Date = new Date()): ScheduledTask[] {
  return tasks.filter((task) => {
    const dueTime = new Date(task.dueAt);
    return dueTime <= now;
  });
}

export function createTask(
  description: string,
  dueAt: string,
  recurring?: "daily" | "weekly" | "monthly",
  now: Date = new Date()
): ScheduledTask {
  let resolvedDueAt = dueAt;

  // Handle relative times like "30m", "2h", "1d"
  const relativeMatch = dueAt.match(/^(\d+)(m|h|d)$/);
  if (relativeMatch) {
    const amount = parseInt(relativeMatch[1], 10);
    const unit = relativeMatch[2];
    const ms =
      unit === "m" ? amount * 60 * 1000 :
      unit === "h" ? amount * 60 * 60 * 1000 :
      amount * 24 * 60 * 60 * 1000;
    resolvedDueAt = new Date(now.getTime() + ms).toISOString();
  }

  return {
    id: randomUUID(),
    description,
    dueAt: resolvedDueAt,
    recurring,
  };
}

export function removeTask(tasks: ScheduledTask[], taskId: string): ScheduledTask[] {
  return tasks.filter((t) => t.id !== taskId);
}

export function advanceRecurringTask(task: ScheduledTask, now: Date = new Date()): ScheduledTask | null {
  if (!task.recurring) {
    return null;
  }

  // Advance from NOW, not from the old dueAt
  // This prevents tasks from being immediately due again if dueAt was in the past
  let nextDue: Date;

  switch (task.recurring) {
    case "daily":
      nextDue = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      break;
    case "weekly":
      nextDue = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      break;
    case "monthly":
      nextDue = new Date(now);
      nextDue.setMonth(nextDue.getMonth() + 1);
      break;
  }

  return {
    ...task,
    dueAt: nextDue.toISOString(),
  };
}
