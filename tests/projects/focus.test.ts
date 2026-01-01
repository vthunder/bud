// tests/projects/focus.test.ts
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync } from "fs";
import { join } from "path";
import { initDatabase, closeDatabase } from "../../src/memory/blocks";
import {
  getFocus,
  setFocus,
  addProjectToFocus,
  removeProjectFromFocus,
  getFocusedProjects,
} from "../../src/projects/focus";

const TEST_DIR = join(import.meta.dir, ".test-focus");
const TEST_DB = join(TEST_DIR, "test.db");

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
  initDatabase(TEST_DB);
});

afterEach(() => {
  closeDatabase();
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("focus manager", () => {
  test("getFocus returns null when not set", () => {
    expect(getFocus()).toBeNull();
  });

  test("setFocus and getFocus roundtrip", () => {
    const focus = {
      projects: [
        { name: "proj1", path: "/p1", priority: 1 },
      ],
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
