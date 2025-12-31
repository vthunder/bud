import { getBlock } from "../memory/blocks";
import { getRecentJournal } from "../memory/journal";
import { getRemainingBudget } from "../budget";

export interface WorkItem {
  type: "scheduled_task" | "goal" | "maintenance";
  id: string;
  description: string;
  context: string;
  estimatedBudget: number;
}

export async function selectWork(scheduledTasks: Array<{ id: string; description: string; context?: string }>): Promise<WorkItem | null> {
  const remaining = getRemainingBudget();

  if (remaining <= 0) {
    return null; // No budget
  }

  // Priority 1: Scheduled tasks that are due
  if (scheduledTasks.length > 0) {
    const task = scheduledTasks[0];
    return {
      type: "scheduled_task",
      id: task.id,
      description: task.description,
      context: task.context || "",
      estimatedBudget: Math.min(0.50, remaining), // Default estimate
    };
  }

  // Priority 2: Active goals
  const goals = getBlock("goals");
  if (goals && goals !== "(No active goals.)") {
    return {
      type: "goal",
      id: "goal-work",
      description: "Work on active goals",
      context: goals,
      estimatedBudget: Math.min(1.00, remaining),
    };
  }

  // Priority 3: Maintenance (sync state, etc.)
  const lastSync = await getLastSyncTime();
  const hoursSinceSync = lastSync
    ? (Date.now() - new Date(lastSync).getTime()) / (1000 * 60 * 60)
    : 999;

  if (hoursSinceSync > 24) {
    return {
      type: "maintenance",
      id: "sync-state",
      description: "Sync state to GitHub",
      context: "Daily backup",
      estimatedBudget: Math.min(0.10, remaining),
    };
  }

  return null; // Nothing to do
}

async function getLastSyncTime(): Promise<string | null> {
  const journal = await getRecentJournal(100);
  const syncEntry = journal.find(e => e.type === "sync" || (e.type === "tool_use" && e.tool === "sync-state"));
  return syncEntry?.ts || null;
}
