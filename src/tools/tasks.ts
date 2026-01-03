import { getBlock, setBlock } from "../memory/blocks";
import {
  type ScheduledTask,
  parseTasksJson,
  serializeTasksJson,
  createTask,
  removeTask,
  markTaskRun,
  isOneOffTask,
} from "../perch/tasks";

const TASKS_BLOCK = "scheduled_tasks";

export interface ScheduleTaskResult {
  success: boolean;
  task?: ScheduledTask;
  error?: string;
}

export interface CancelTaskResult {
  success: boolean;
  error?: string;
}

export interface ListTasksResult {
  tasks: ScheduledTask[];
}

/**
 * Schedule a new task
 * @param description - What the task should do
 * @param timing - "daily", "weekly", "hourly", or ISO timestamp / relative time ("30m", "2h")
 * @param requiresWakeup - Whether this task should wake Bud up (default true)
 * @param context - Optional additional context
 */
export function scheduleTask(
  description: string,
  timing: string,
  requiresWakeup: boolean = true,
  context?: string
): ScheduleTaskResult {
  try {
    const json = getBlock(TASKS_BLOCK) ?? "[]";
    const tasks = parseTasksJson(json);

    const task = createTask(description, timing, requiresWakeup, context);
    tasks.push(task);
    setBlock(TASKS_BLOCK, serializeTasksJson(tasks));

    return { success: true, task };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function cancelTask(taskId: string): CancelTaskResult {
  try {
    const json = getBlock(TASKS_BLOCK) ?? "[]";
    const tasks = parseTasksJson(json);

    const taskExists = tasks.some((t) => t.id === taskId);
    if (!taskExists) {
      return { success: false, error: `Task ${taskId} not found` };
    }

    const updated = removeTask(tasks, taskId);
    setBlock(TASKS_BLOCK, serializeTasksJson(updated));

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function listScheduledTasks(): ListTasksResult {
  try {
    const json = getBlock(TASKS_BLOCK) ?? "[]";
    const tasks = parseTasksJson(json);
    return { tasks };
  } catch {
    return { tasks: [] };
  }
}

export function markTaskComplete(taskId: string): CancelTaskResult {
  try {
    const json = getBlock(TASKS_BLOCK) ?? "[]";
    const tasks = parseTasksJson(json);

    const taskIndex = tasks.findIndex((t) => t.id === taskId);
    if (taskIndex === -1) {
      console.log(`[tasks] markTaskComplete: task ${taskId} not found`);
      return { success: false, error: `Task ${taskId} not found` };
    }

    const task = tasks[taskIndex];
    const isOneOff = isOneOffTask(task);
    console.log(`[tasks] markTaskComplete: ${task.description} (timing: ${task.timing}, one-off: ${isOneOff})`);

    if (isOneOff) {
      // One-off task: remove it
      console.log(`[tasks] Removing one-time task`);
      tasks.splice(taskIndex, 1);
    } else {
      // Recurring task: update lastRun timestamp
      console.log(`[tasks] Updating lastRun for recurring task`);
      tasks[taskIndex] = markTaskRun(task);
    }

    setBlock(TASKS_BLOCK, serializeTasksJson(tasks));
    return { success: true };
  } catch (error) {
    console.error(`[tasks] markTaskComplete error:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
