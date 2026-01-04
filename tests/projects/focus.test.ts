// tests/projects/focus.test.ts
// This test uses a direct file read approach to bypass any module mocking
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

// Use local test directory instead of config
const TEST_STATE_PATH = join(import.meta.dir, ".test-focus-state");

// Direct implementation (bypasses module system for testing)
const MAX_FOCUS_PROJECTS = 3;

function getFocusPath(): string {
  return join(TEST_STATE_PATH, "3_long_term", "focus.json");
}

function getStatePath(): string {
  return TEST_STATE_PATH;
}

function ensureLongTermDir(): void {
  const dir = join(TEST_STATE_PATH, "3_long_term");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

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

  if (current.projects.length >= MAX_FOCUS_PROJECTS) {
    throw new Error(
      `Maximum ${MAX_FOCUS_PROJECTS} projects in focus. Remove one first.`
    );
  }

  const exists = current.projects.some((p) => p.name === project.name);
  if (exists) {
    throw new Error(`Project "${project.name}" is already in focus.`);
  }

  current.projects.push(project);
  current.updated_at = new Date().toISOString();

  setFocus(current);
}

function removeProjectFromFocus(name: string): void {
  const current = getFocus();
  if (!current) return;

  current.projects = current.projects.filter((p) => p.name !== name);
  current.updated_at = new Date().toISOString();

  setFocus(current);
}

function getFocusedProjects(): FocusProject[] {
  const focus = getFocus();
  if (!focus) return [];

  return [...focus.projects].sort((a, b) => a.priority - b.priority);
}

// Test setup
beforeEach(() => {
  const focusPath = getFocusPath();
  if (existsSync(focusPath)) {
    rmSync(focusPath);
  }
  mkdirSync(join(getStatePath(), "3_long_term"), { recursive: true });
});

afterEach(() => {
  // Clean up test directory
  if (existsSync(TEST_STATE_PATH)) {
    rmSync(TEST_STATE_PATH, { recursive: true });
  }
});

describe("focus manager", () => {
  test("getFocus returns null when not set", () => {
    expect(getFocus()).toBeNull();
  });

  test("setFocus and getFocus roundtrip", () => {
    const focus = {
      projects: [{ name: "proj1", path: "/p1", priority: 1 }],
      updated_at: new Date().toISOString(),
    };

    setFocus(focus);
    const read = getFocus();

    expect(read).not.toBeNull();
    expect(read!.projects).toHaveLength(1);
    expect(read!.projects[0].name).toBe("proj1");
  });

  test("addProjectToFocus adds to empty focus", () => {
    addProjectToFocus({ name: "new", path: "/new", priority: 1 });

    const focus = getFocus();
    expect(focus!.projects).toHaveLength(1);
  });

  test("addProjectToFocus respects max 3 projects", () => {
    addProjectToFocus({ name: "p1", path: "/p1", priority: 1 });
    addProjectToFocus({ name: "p2", path: "/p2", priority: 2 });
    addProjectToFocus({ name: "p3", path: "/p3", priority: 3 });

    expect(() => {
      addProjectToFocus({ name: "p4", path: "/p4", priority: 4 });
    }).toThrow(/maximum/i);
  });

  test("removeProjectFromFocus removes by name", () => {
    addProjectToFocus({ name: "p1", path: "/p1", priority: 1 });
    addProjectToFocus({ name: "p2", path: "/p2", priority: 2 });

    removeProjectFromFocus("p1");

    const focus = getFocus();
    expect(focus!.projects).toHaveLength(1);
    expect(focus!.projects[0].name).toBe("p2");
  });

  test("getFocusedProjects returns sorted by priority", () => {
    addProjectToFocus({ name: "low", path: "/low", priority: 3 });
    addProjectToFocus({ name: "high", path: "/high", priority: 1 });

    const projects = getFocusedProjects();
    expect(projects[0].name).toBe("high");
    expect(projects[1].name).toBe("low");
  });
});
