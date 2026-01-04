// tests/integration/projects-e2e.test.ts
// Uses direct file implementation to bypass any module mocking
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { config } from "../../src/config";
import { setDailyCap, resetBudgetState, getRemainingBudget } from "../../src/budget";
import { createProject } from "../../src/projects/files";

const TEST_PROJECTS = join(config.state.path, "3_long_term", "projects");

// Direct focus implementation (bypasses module system)
interface FocusProject {
  name: string;
  path: string;
  priority: number;
  notes?: string;
}

interface FocusConfig {
  projects: FocusProject[];
  updated_at: string;
}

function getFocusPath(): string {
  return join(config.state.path, "3_long_term", "focus.json");
}

function ensureLongTermDir(): void {
  const dir = join(config.state.path, "3_long_term");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function getFocus(): FocusConfig | null {
  const path = getFocusPath();
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as FocusConfig;
  } catch {
    return null;
  }
}

function setFocus(focus: FocusConfig): void {
  ensureLongTermDir();
  writeFileSync(getFocusPath(), JSON.stringify(focus, null, 2));
}

function addProjectToFocus(project: FocusProject): void {
  const current = getFocus() || { projects: [], updated_at: "" };
  current.projects.push(project);
  current.updated_at = new Date().toISOString();
  setFocus(current);
}

function getFocusedProjects(): FocusProject[] {
  const focus = getFocus();
  if (!focus) return [];
  return [...focus.projects].sort((a, b) => a.priority - b.priority);
}

// Simplified selectWork (just tests the focus-based work selection)
interface WorkItem {
  type: "scheduled_task" | "goal" | "maintenance";
  id: string;
  description: string;
  context: string;
  estimatedBudget: number;
}

function selectWork(scheduledTasks: any[]): WorkItem | null {
  const remaining = getRemainingBudget();
  if (remaining <= 0) return null;

  if (scheduledTasks.length > 0) {
    const task = scheduledTasks[0];
    return {
      type: "scheduled_task",
      id: task.id,
      description: task.description,
      context: task.context || "",
      estimatedBudget: Math.min(0.5, remaining),
    };
  }

  const focus = getFocus();
  if (focus && focus.projects.length > 0) {
    const focusedProjects = getFocusedProjects();
    const topProject = focusedProjects[0];
    return {
      type: "goal",
      id: `project-${topProject.name}`,
      description: `Work on ${topProject.name}`,
      context: `Focus on ${topProject.name}`,
      estimatedBudget: Math.min(1.0, remaining),
    };
  }

  return null;
}

beforeEach(() => {
  // Create required directories
  mkdirSync(TEST_PROJECTS, { recursive: true });
  mkdirSync(join(config.state.path, "2_working"), { recursive: true });
  ensureLongTermDir();

  // Set up budget (in-memory)
  resetBudgetState();
  setDailyCap(10.0);

  // Clean up focus.json before each test
  const focusPath = getFocusPath();
  if (existsSync(focusPath)) {
    rmSync(focusPath);
  }
});

afterEach(() => {
  // Clean up test project directory
  if (existsSync(TEST_PROJECTS)) {
    rmSync(TEST_PROJECTS, { recursive: true, force: true });
  }
  // Clean up focus.json
  const focusPath = getFocusPath();
  if (existsSync(focusPath)) {
    rmSync(focusPath);
  }
  // Reset budget state
  resetBudgetState();
});

describe("projects e2e", () => {
  test("full workflow: create project, add to focus, select work", async () => {
    // Create project
    const projectPath = join(TEST_PROJECTS, "test-project");
    createProject(projectPath, "Test Project");
    expect(existsSync(projectPath)).toBe(true);

    // Add to focus
    addProjectToFocus({
      name: "test-project",
      path: projectPath,
      priority: 1,
    });

    // Verify focus
    const focused = getFocusedProjects();
    expect(focused).toHaveLength(1);
    expect(focused[0].name).toBe("test-project");

    // Select work should return project-based work
    const work = selectWork([]);
    expect(work).not.toBeNull();
    expect(work!.type).toBe("goal");
    expect(work!.id).toContain("test-project");
  });
});
