// tests/perch/work.test.ts
import { describe, expect, test, mock, beforeEach, afterAll } from "bun:test";

// Mock dependencies
const mockSearchJournal = mock(() => []);
mock.module("../../src/memory/working", () => ({
  searchJournal: mockSearchJournal,
  getFocus: mock(() => ""),
}));

const mockGetRemainingBudget = mock(() => 10.0);
mock.module("../../src/budget", () => ({
  getRemainingBudget: mockGetRemainingBudget,
}));

const mockGetFocus = mock(() => null);
const mockGetFocusedProjects = mock(() => []);
const mockAddProjectToFocus = mock(() => {});
const mockRemoveProjectFromFocus = mock(() => {});
const mockSetFocus = mock(() => {});
mock.module("../../src/projects/focus", () => ({
  getFocus: mockGetFocus,
  getFocusedProjects: mockGetFocusedProjects,
  addProjectToFocus: mockAddProjectToFocus,
  removeProjectFromFocus: mockRemoveProjectFromFocus,
  setFocus: mockSetFocus,
}));

// Now import the module being tested
const { selectWork } = await import("../../src/perch/work");

// Store original modules to restore later
const originalFocusModule = "../../src/projects/focus";

afterAll(() => {
  // Clear mock so other tests can use the real module
  mock.restore();
});

describe("selectWork with focus", () => {
  beforeEach(() => {
    mockSearchJournal.mockClear();
    mockGetRemainingBudget.mockClear();
    mockGetFocus.mockClear();
    mockGetFocusedProjects.mockClear();

    // Reset to default behavior
    mockGetRemainingBudget.mockReturnValue(10.0);
    mockGetFocus.mockReturnValue(null);
    mockGetFocusedProjects.mockReturnValue([]);
    mockSearchJournal.mockReturnValue([]);
  });

  test("returns skill-based work when focus is set", async () => {
    const focus = {
      projects: [
        { name: "test-project", path: "/test/path", priority: 1 },
      ],
      updated_at: new Date().toISOString(),
    };

    mockGetFocus.mockReturnValue(focus);
    mockGetFocusedProjects.mockReturnValue(focus.projects);

    const work = await selectWork([]);

    expect(work).not.toBeNull();
    expect(work!.type).toBe("goal");
    expect(work!.id).toBe("project-test-project");
    expect(work!.description).toBe("Work on test-project");
    expect(work!.context).toContain("select-work");
    expect(work!.context).toContain("test-project");
  });

  test("includes all focused projects in context", async () => {
    const focus = {
      projects: [
        { name: "project-a", path: "/path/a", priority: 1 },
        { name: "project-b", path: "/path/b", priority: 2, notes: "Backend work" },
      ],
      updated_at: new Date().toISOString(),
    };

    mockGetFocus.mockReturnValue(focus);
    mockGetFocusedProjects.mockReturnValue(focus.projects);

    const work = await selectWork([]);

    expect(work).not.toBeNull();
    expect(work!.context).toContain("project-a");
    expect(work!.context).toContain("project-b");
    expect(work!.context).toContain("Backend work");
  });

  test("falls back to maintenance when no focus", async () => {
    // No focus set, no recent sync - should check maintenance
    mockGetFocus.mockReturnValue(null);
    mockSearchJournal.mockReturnValue([]); // No sync entries

    const work = await selectWork([]);

    // Will be maintenance because hoursSinceSync > 24 (no sync entries)
    expect(work).not.toBeNull();
    expect(work!.type).toBe("maintenance");
  });

  test("prioritizes scheduled tasks over focus", async () => {
    const focus = {
      projects: [{ name: "project", path: "/path", priority: 1 }],
      updated_at: new Date().toISOString(),
    };

    mockGetFocus.mockReturnValue(focus);
    mockGetFocusedProjects.mockReturnValue(focus.projects);

    const scheduledTasks = [
      { id: "task-1", description: "Daily standup", context: "Team meeting" },
    ];

    const work = await selectWork(scheduledTasks);

    expect(work).not.toBeNull();
    expect(work!.type).toBe("scheduled_task");
    expect(work!.id).toBe("task-1");
  });

  test("returns null when budget exhausted", async () => {
    mockGetRemainingBudget.mockReturnValue(0);

    const work = await selectWork([]);

    expect(work).toBeNull();
  });

  test("returns null when recent sync exists and no focus", async () => {
    mockGetFocus.mockReturnValue(null);
    // Recent sync entry exists
    mockSearchJournal.mockReturnValue([
      { ts: new Date().toISOString(), type: "sync" }
    ]);

    const work = await selectWork([]);

    // Should return null since sync was recent and no focus/scheduled tasks
    expect(work).toBeNull();
  });
});
