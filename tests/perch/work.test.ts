// tests/perch/work.test.ts
import { describe, expect, test, mock, beforeEach } from "bun:test";

// Mock dependencies
const mockGetBlock = mock((name: string) => {
  switch (name) {
    case "budget_daily_cap": return "10.00";
    case "budget_daily_spent": return "0.00";
    default: return null;
  }
});

mock.module("../../src/memory/blocks", () => ({
  getBlock: mockGetBlock,
  setBlock: mock(() => {}),
  initDatabase: mock(() => {}),
  closeDatabase: mock(() => {}),
}));

const mockSearchJournal = mock(() => Promise.resolve([]));
mock.module("../../src/memory/journal", () => ({
  searchJournal: mockSearchJournal,
  initJournal: mock(() => {}),
}));

// Now import the module being tested
const { selectWork } = await import("../../src/perch/work");

describe("selectWork with focus", () => {
  beforeEach(() => {
    mockGetBlock.mockClear();
    mockSearchJournal.mockClear();
    // Reset to default behavior
    mockGetBlock.mockImplementation((name: string) => {
      switch (name) {
        case "budget_daily_cap": return "10.00";
        case "budget_daily_spent": return "0.00";
        default: return null;
      }
    });
  });

  test("returns skill-based work when focus is set", async () => {
    const focus = {
      projects: [
        { name: "test-project", path: "/test/path", priority: 1 },
      ],
      updated_at: new Date().toISOString(),
    };

    mockGetBlock.mockImplementation((name: string) => {
      switch (name) {
        case "budget_daily_cap": return "10.00";
        case "budget_daily_spent": return "0.00";
        case "focus": return JSON.stringify(focus);
        default: return null;
      }
    });

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

    mockGetBlock.mockImplementation((name: string) => {
      switch (name) {
        case "budget_daily_cap": return "10.00";
        case "budget_daily_spent": return "0.00";
        case "focus": return JSON.stringify(focus);
        default: return null;
      }
    });

    const work = await selectWork([]);

    expect(work).not.toBeNull();
    expect(work!.context).toContain("project-a");
    expect(work!.context).toContain("project-b");
    expect(work!.context).toContain("Backend work");
  });

  test("falls back to legacy goals when no focus", async () => {
    mockGetBlock.mockImplementation((name: string) => {
      switch (name) {
        case "budget_daily_cap": return "10.00";
        case "budget_daily_spent": return "0.00";
        case "goals": return "- Finish feature X\n- Review PR";
        default: return null;
      }
    });

    const work = await selectWork([]);

    expect(work).not.toBeNull();
    expect(work!.type).toBe("goal");
    expect(work!.id).toBe("goal-work");
    expect(work!.context).toContain("Finish feature X");
  });

  test("falls back to maintenance when no focus and no goals", async () => {
    // No focus, no goals set - should check maintenance
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

    mockGetBlock.mockImplementation((name: string) => {
      switch (name) {
        case "budget_daily_cap": return "10.00";
        case "budget_daily_spent": return "0.00";
        case "focus": return JSON.stringify(focus);
        default: return null;
      }
    });

    const scheduledTasks = [
      { id: "task-1", description: "Daily standup", context: "Team meeting" },
    ];

    const work = await selectWork(scheduledTasks);

    expect(work).not.toBeNull();
    expect(work!.type).toBe("scheduled_task");
    expect(work!.id).toBe("task-1");
  });

  test("returns null when budget exhausted", async () => {
    mockGetBlock.mockImplementation((name: string) => {
      switch (name) {
        case "budget_daily_cap": return "5.00";
        case "budget_daily_spent": return "5.00"; // No remaining budget
        default: return null;
      }
    });

    const work = await selectWork([]);

    expect(work).toBeNull();
  });
});
