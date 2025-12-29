import type Letta from "@letta-ai/letta-client";
import { getMemoryBlock, setMemoryBlock } from "../memory/letta";
import {
  type ScheduledTask,
  parseTasksJson,
  serializeTasksJson,
  createTask,
  removeTask,
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

export async function scheduleTask(
  client: Letta,
  agentId: string,
  description: string,
  dueAt: string,
  recurring?: "daily" | "weekly" | "monthly",
  context?: string
): Promise<ScheduleTaskResult> {
  try {
    const json = await getMemoryBlock(client, agentId, TASKS_BLOCK);
    const tasks = parseTasksJson(json);

    const task = createTask(description, dueAt, recurring);
    if (context) {
      task.context = context;
    }

    tasks.push(task);
    await setMemoryBlock(client, agentId, TASKS_BLOCK, serializeTasksJson(tasks));

    return { success: true, task };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function cancelTask(
  client: Letta,
  agentId: string,
  taskId: string
): Promise<CancelTaskResult> {
  try {
    const json = await getMemoryBlock(client, agentId, TASKS_BLOCK);
    const tasks = parseTasksJson(json);

    const taskExists = tasks.some((t) => t.id === taskId);
    if (!taskExists) {
      return { success: false, error: `Task ${taskId} not found` };
    }

    const updated = removeTask(tasks, taskId);
    await setMemoryBlock(client, agentId, TASKS_BLOCK, serializeTasksJson(updated));

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function listScheduledTasks(
  client: Letta,
  agentId: string
): Promise<ListTasksResult> {
  const json = await getMemoryBlock(client, agentId, TASKS_BLOCK);
  const tasks = parseTasksJson(json);
  return { tasks };
}

export async function markTaskComplete(
  client: Letta,
  agentId: string,
  taskId: string
): Promise<CancelTaskResult> {
  try {
    const json = await getMemoryBlock(client, agentId, TASKS_BLOCK);
    const tasks = parseTasksJson(json);

    const taskIndex = tasks.findIndex((t) => t.id === taskId);
    if (taskIndex === -1) {
      return { success: false, error: `Task ${taskId} not found` };
    }

    const task = tasks[taskIndex];

    if (task.recurring) {
      const { advanceRecurringTask } = await import("../perch/tasks");
      const nextTask = advanceRecurringTask(task);
      if (nextTask) {
        tasks[taskIndex] = nextTask;
      }
    } else {
      tasks.splice(taskIndex, 1);
    }

    await setMemoryBlock(client, agentId, TASKS_BLOCK, serializeTasksJson(tasks));
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
