// src/projects/files.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import type { ProjectGoal } from "./types";

/**
 * Check if a project directory exists
 */
export function projectExists(projectPath: string): boolean {
  return existsSync(projectPath);
}

/**
 * Create a new project directory with notes.md and goals.md files
 */
export function createProject(projectPath: string, name: string): void {
  mkdirSync(projectPath, { recursive: true });
  writeFileSync(join(projectPath, "notes.md"), `# ${name}\n\n`);
  writeFileSync(join(projectPath, "goals.md"), "# Goals\n\n## Active\n\n## Completed\n\n## Blocked\n\n## Deferred\n");
}

/**
 * Read project notes from notes.md
 */
export function readProjectNotes(projectPath: string): string | null {
  const notesPath = join(projectPath, "notes.md");
  if (!existsSync(notesPath)) {
    return null;
  }
  return readFileSync(notesPath, "utf-8");
}

/**
 * Write project notes to notes.md
 */
export function writeProjectNotes(projectPath: string, content: string): void {
  const notesPath = join(projectPath, "notes.md");
  writeFileSync(notesPath, content);
}

/**
 * Read project goals from goals.md
 */
export function readProjectGoals(projectPath: string): ProjectGoal[] {
  const goalsPath = join(projectPath, "goals.md");
  if (!existsSync(goalsPath)) {
    return [];
  }
  const content = readFileSync(goalsPath, "utf-8");
  return parseGoalsMarkdown(content);
}

/**
 * Write project goals to goals.md
 */
export function writeProjectGoals(projectPath: string, goals: ProjectGoal[]): void {
  const goalsPath = join(projectPath, "goals.md");
  const content = serializeGoalsMarkdown(goals);
  writeFileSync(goalsPath, content);
}

/**
 * Parse goals markdown format into ProjectGoal array
 *
 * Format:
 * # Goals
 *
 * ## Active
 *
 * ### Goal Title
 * - Priority: 1
 * - Deadline: 2026-01-15
 * - Links: beads:BID-5, https://example.com
 * - Notes: Some notes
 *
 * ## Completed
 * ...
 */
export function parseGoalsMarkdown(content: string): ProjectGoal[] {
  const goals: ProjectGoal[] = [];
  const lines = content.split("\n");

  let currentStatus: ProjectGoal["status"] | null = null;
  let currentGoal: Partial<ProjectGoal> | null = null;

  for (const line of lines) {
    // Section headers (## Active, ## Completed, etc.)
    const sectionMatch = line.match(/^## (Active|Completed|Blocked|Deferred)\s*$/i);
    if (sectionMatch) {
      // Save previous goal if exists
      if (currentGoal && currentGoal.title) {
        goals.push(currentGoal as ProjectGoal);
      }
      currentStatus = sectionMatch[1].toLowerCase() as ProjectGoal["status"];
      currentGoal = null;
      continue;
    }

    // Goal title (### Goal Title)
    const titleMatch = line.match(/^### (.+)$/);
    if (titleMatch && currentStatus) {
      // Save previous goal if exists
      if (currentGoal && currentGoal.title) {
        goals.push(currentGoal as ProjectGoal);
      }
      currentGoal = {
        title: titleMatch[1].trim(),
        status: currentStatus,
        priority: 2, // default priority
      };
      continue;
    }

    // Goal properties (- Key: Value)
    if (currentGoal) {
      const propMatch = line.match(/^- (Priority|Deadline|Links|Notes): (.+)$/);
      if (propMatch) {
        const [, key, value] = propMatch;
        switch (key.toLowerCase()) {
          case "priority":
            currentGoal.priority = parseInt(value, 10) || 2;
            break;
          case "deadline":
            currentGoal.deadline = value.trim();
            break;
          case "links":
            currentGoal.links = value.split(",").map(l => l.trim());
            break;
          case "notes":
            currentGoal.notes = value.trim();
            break;
        }
      }
    }
  }

  // Don't forget the last goal
  if (currentGoal && currentGoal.title) {
    goals.push(currentGoal as ProjectGoal);
  }

  return goals;
}

/**
 * Serialize ProjectGoal array to markdown format
 */
export function serializeGoalsMarkdown(goals: ProjectGoal[]): string {
  const sections: Record<ProjectGoal["status"], ProjectGoal[]> = {
    active: [],
    completed: [],
    blocked: [],
    deferred: [],
  };

  // Group goals by status
  for (const goal of goals) {
    sections[goal.status].push(goal);
  }

  const lines: string[] = ["# Goals", ""];

  // Render each section
  for (const status of ["active", "completed", "blocked", "deferred"] as const) {
    lines.push(`## ${status.charAt(0).toUpperCase() + status.slice(1)}`);
    lines.push("");

    for (const goal of sections[status]) {
      lines.push(`### ${goal.title}`);
      lines.push(`- Priority: ${goal.priority}`);
      if (goal.deadline) {
        lines.push(`- Deadline: ${goal.deadline}`);
      }
      if (goal.links && goal.links.length > 0) {
        lines.push(`- Links: ${goal.links.join(", ")}`);
      }
      if (goal.notes) {
        lines.push(`- Notes: ${goal.notes}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}
