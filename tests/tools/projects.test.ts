// tests/tools/projects.test.ts
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";

// We'll test the tool functions directly
import {
  listProjects,
  getProjectDetails,
  updateProjectNotes,
} from "../../src/tools/projects";

const TEST_DIR = join(import.meta.dir, ".test-project-tools");
const TEST_PROJECTS = join(TEST_DIR, "projects");

beforeEach(() => {
  mkdirSync(TEST_PROJECTS, { recursive: true });

  // Create a test project
  const projPath = join(TEST_PROJECTS, "test-proj");
  mkdirSync(projPath);
  writeFileSync(join(projPath, "notes.md"), "# Test Project\n\nSome notes");
  writeFileSync(join(projPath, "goals.md"), "# Goals\n\n## Active\n\n### Goal 1\n- Priority: 1");
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("project tools", () => {
  test("listProjects returns project names", async () => {
    const result = await listProjects(TEST_PROJECTS);
    expect(result).toContain("test-proj");
  });

  test("getProjectDetails returns notes and goals", async () => {
    const details = await getProjectDetails(join(TEST_PROJECTS, "test-proj"));
    expect(details.notes).toContain("Test Project");
    expect(details.goals).toHaveLength(1);
    expect(details.goals[0].title).toBe("Goal 1");
  });

  test("updateProjectNotes appends content", async () => {
    await updateProjectNotes(join(TEST_PROJECTS, "test-proj"), "\n\n## New Section\n\nNew content");
    const details = await getProjectDetails(join(TEST_PROJECTS, "test-proj"));
    expect(details.notes).toContain("New Section");
  });
});
