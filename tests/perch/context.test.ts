import { describe, expect, test, mock, beforeEach } from "bun:test";

// Mock the GitHub module BEFORE importing context
const mockCheckGitHubActivity = mock(() =>
  Promise.resolve({ activity: {}, summary: "", hasNew: false })
);

mock.module("../../src/perch/github", () => ({
  checkGitHubActivity: mockCheckGitHubActivity,
}));

const mockGetCalendarContext = mock(() =>
  Promise.resolve({ summary: "", events: [] })
);

mock.module("../../src/perch/calendar", () => ({
  getCalendarContext: mockGetCalendarContext,
}));

// Mock dependencies
const mockReadLogs = mock(() => Promise.resolve([]));

mock.module("../../src/memory/logs", () => ({
  readLogs: mockReadLogs,
  appendLog: mock(() => Promise.resolve()),
}));

const mockGetBlock = mock((name: string) => {
  switch (name) {
    case "persona": return "Test persona";
    case "current_focus": return "Test focus";
    case "owner_context": return "Test owner";
    case "timezone": return "UTC";
    case "scheduled_tasks": return "[]";
    case "github_repos": return "[]";
    default: return null;
  }
});

mock.module("../../src/memory/blocks", () => ({
  getBlock: mockGetBlock,
  setBlock: mock(() => {}),
  initDatabase: mock(() => {}),
  closeDatabase: mock(() => {}),
  getAllCurrentBlocks: mock(() => ({})),
  getBlockHistory: mock(() => []),
  getBlocksByLayer: mock(() => ({})),
  getDatabase: mock(() => ({})),
}));

// Now import the module being tested
const { gatherPerchContext } = await import("../../src/perch/context");

describe("gatherPerchContext", () => {
  beforeEach(() => {
    mockReadLogs.mockClear();
    mockGetBlock.mockClear();
    mockGetBlock.mockImplementation((name: string) => {
      switch (name) {
        case "persona": return "Test persona";
        case "current_focus": return "Test focus";
        case "owner_context": return "Test owner";
        case "timezone": return "UTC";
        case "scheduled_tasks": return "[]";
        case "github_repos": return "[]";
        default: return null;
      }
    });
    mockCheckGitHubActivity.mockClear();
    mockCheckGitHubActivity.mockResolvedValue({ activity: {}, summary: "", hasNew: false });
    mockGetCalendarContext.mockClear();
    mockGetCalendarContext.mockResolvedValue({ summary: "", events: [] });
  });

  test("gathers time, memory, and recent interactions", async () => {
    const now = new Date("2025-12-28T14:00:00Z");
    mockReadLogs.mockResolvedValueOnce([
      {
        timestamp: "2025-12-28T12:00:00Z",
        type: "interaction",
        content: "User: hello\nBud: hi there",
      },
    ]);

    const context = await gatherPerchContext({
      now,
    });

    expect(context.currentTime).toBe("2025-12-28T14:00:00.000Z");
    expect(context.hourOfDay).toBe(14);
    expect(context.dayOfWeek).toBe("Sunday");
    expect(context.memory.persona).toBe("Test persona");
    expect(context.recentInteractions).toHaveLength(1);
    expect(context.hoursSinceLastInteraction).toBe(2);
    expect(context.dueTasks).toEqual([]);
    expect(context.githubSummary).toBe("");
    expect(context.hasNewGitHub).toBe(false);
    expect(context.calendarSummary).toBe("");
  });

  test("handles no recent interactions", async () => {
    mockReadLogs.mockResolvedValueOnce([]);

    const context = await gatherPerchContext({
      now: new Date(),
    });

    expect(context.recentInteractions).toHaveLength(0);
    expect(context.hoursSinceLastInteraction).toBeNull();
    expect(context.githubSummary).toBe("");
    expect(context.hasNewGitHub).toBe(false);
    expect(context.calendarSummary).toBe("");
  });
});
