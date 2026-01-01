import { getBlock } from "../memory/blocks";
import { searchJournal } from "../memory/journal";
import { getRemainingBudget } from "../budget";
import { getFocus, getFocusedProjects } from "../projects/focus";

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

  // Priority 2: Focus-based work (invoke select-work skill)
  const focus = getFocus();
  if (focus && focus.projects.length > 0) {
    const focusedProjects = getFocusedProjects();
    const topProject = focusedProjects[0];

    // Return work item that tells the agent to use select-work skill
    return {
      type: "goal",
      id: `project-${topProject.name}`,
      description: `Work on ${topProject.name}`,
      context: buildFocusContext(focusedProjects),
      estimatedBudget: Math.min(1.00, remaining),
    };
  }

  // Priority 3: Active goals (legacy - backwards compatibility)
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

  // Priority 4: Maintenance (sync state, etc.)
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
  const entries = await searchJournal(e =>
    e.type === "sync" ||
    (e.type === "tool_use" && e.tool === "sync-state") ||
    (e.type === "work_completed" && e.work_type === "maintenance" && e.description === "Sync state to GitHub")
  );

  // Return the most recent match
  return entries.length > 0 ? entries[entries.length - 1].ts : null;
}

function buildFocusContext(projects: Array<{ name: string; path: string; priority: number; notes?: string }>): string {
  let context = "## Focused Projects\n\n";
  context += "Use the `select-work` skill to evaluate these projects and select work.\n\n";

  for (const p of projects) {
    context += `### ${p.name} (priority ${p.priority})\n`;
    context += `- Path: ${p.path}\n`;
    if (p.notes) context += `- Notes: ${p.notes}\n`;
    context += "\n";
  }

  return context;
}
