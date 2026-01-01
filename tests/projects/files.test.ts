// tests/projects/files.test.ts
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import {
  projectExists,
  readProjectNotes,
  readProjectGoals,
  writeProjectNotes,
  writeProjectGoals,
  createProject,
} from "../../src/projects/files";

const TEST_DIR = join(import.meta.dir, ".test-projects");

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("project files", () => {
  test("projectExists returns false for non-existent project", () => {
    expect(projectExists(join(TEST_DIR, "nonexistent"))).toBe(false);
  });

  test("createProject creates directory with notes.md and goals.md", () => {
    const projectPath = join(TEST_DIR, "new-project");
    createProject(projectPath, "New Project");

    expect(existsSync(projectPath)).toBe(true);
    expect(existsSync(join(projectPath, "notes.md"))).toBe(true);
    expect(existsSync(join(projectPath, "goals.md"))).toBe(true);
  });

  test("readProjectNotes returns null for missing file", () => {
    const projectPath = join(TEST_DIR, "empty");
    mkdirSync(projectPath);
    expect(readProjectNotes(projectPath)).toBeNull();
  });

  test("readProjectNotes returns content", () => {
    const projectPath = join(TEST_DIR, "with-notes");
    mkdirSync(projectPath);
    writeFileSync(join(projectPath, "notes.md"), "# My Notes\n\nSome content");

    const notes = readProjectNotes(projectPath);
    expect(notes).toContain("My Notes");
  });

  test("writeProjectNotes creates/updates file", () => {
    const projectPath = join(TEST_DIR, "write-notes");
    mkdirSync(projectPath);

    writeProjectNotes(projectPath, "# Updated Notes");
    expect(readProjectNotes(projectPath)).toBe("# Updated Notes");
  });

  test("readProjectGoals returns empty array for missing file", () => {
    const projectPath = join(TEST_DIR, "no-goals");
    mkdirSync(projectPath);
    expect(readProjectGoals(projectPath)).toEqual([]);
  });

  test("writeProjectGoals and readProjectGoals roundtrip", () => {
    const projectPath = join(TEST_DIR, "goals-test");
    mkdirSync(projectPath);

    const goals = [
      { title: "Goal 1", priority: 1, status: "active" as const },
      { title: "Goal 2", priority: 2, status: "completed" as const },
    ];

    writeProjectGoals(projectPath, goals);
    const read = readProjectGoals(projectPath);

    expect(read).toHaveLength(2);
    expect(read[0].title).toBe("Goal 1");
    expect(read[1].status).toBe("completed");
  });
});
