// tests/projects/types.test.ts
import { describe, expect, test } from "bun:test";
import type { Project, FocusConfig, ProjectGoal } from "../../src/projects/types";

describe("project types", () => {
  test("Project type has required fields", () => {
    const project: Project = {
      name: "test-project",
      path: "/path/to/project",
    };
    expect(project.name).toBe("test-project");
    expect(project.path).toBe("/path/to/project");
  });

  test("FocusConfig type has projects array", () => {
    const focus: FocusConfig = {
      projects: [
        { name: "proj1", path: "/p1", priority: 1 },
      ],
      updated_at: new Date().toISOString(),
    };
    expect(focus.projects).toHaveLength(1);
    expect(focus.projects[0].priority).toBe(1);
  });

  test("ProjectGoal type has required fields", () => {
    const goal: ProjectGoal = {
      title: "Ship feature",
      priority: 1,
      status: "active",
    };
    expect(goal.title).toBe("Ship feature");
    expect(goal.status).toBe("active");
  });
});
