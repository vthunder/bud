// tests/integration/projects-e2e.test.ts
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { initDatabase, setBlock, closeDatabase } from "../../src/memory/blocks";
import { initJournal } from "../../src/memory/journal";
import { createProject } from "../../src/projects/files";
import { addProjectToFocus, getFocusedProjects } from "../../src/projects/focus";
import { selectWork } from "../../src/perch/work";

const TEST_DIR = join(import.meta.dir, ".test-e2e");
const TEST_DB = join(TEST_DIR, "test.db");
const TEST_JOURNAL = join(TEST_DIR, "journal.jsonl");
const TEST_PROJECTS = join(TEST_DIR, "projects");

beforeEach(() => {
  mkdirSync(TEST_PROJECTS, { recursive: true });
  initDatabase(TEST_DB);
  initJournal(TEST_JOURNAL);

  // Set budget
  setBlock("budget_daily_cap", "10.00", 4);
  setBlock("budget_daily_spent", "0.00", 4);
});

afterEach(() => {
  closeDatabase();
  rmSync(TEST_DIR, { recursive: true, force: true });
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
    const work = await selectWork([]);
    expect(work).not.toBeNull();
    expect(work!.type).toBe("goal");
    expect(work!.id).toContain("test-project");
  });
});
