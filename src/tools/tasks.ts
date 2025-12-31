import { getBlock, setBlock } from "../memory/blocks";
import {
  type ScheduledTask,
  parseTasksJson,
  serializeTasksJson,
  createTask,
  removeTask,
  advanceRecurringTask,
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

export function scheduleTask(
  description: string,
  dueAt: string,
  recurring?: "daily" | "weekly" | "monthly",
  context?: string
): ScheduleTaskResult {
  try {
    const json = getBlock(TASKS_BLOCK) ?? "[]";
    const tasks = parseTasksJson(json);

    const task = createTask(description, dueAt, recurring);
    if (context) {
      task.context = context;
    }

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
      return { success: false, error: `Task ${taskId} not found` };
    }

    const task = tasks[taskIndex];

    if (task.recurring) {
      const nextTask = advanceRecurringTask(task);
      if (nextTask) {
        tasks[taskIndex] = nextTask;
      }
    } else {
      tasks.splice(taskIndex, 1);
    }

    setBlock(TASKS_BLOCK, serializeTasksJson(tasks));
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
