import { describe, expect, test, mock, beforeEach, afterAll } from "bun:test";

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

// Mock logs
const mockReadLogs = mock(() => Promise.resolve([]));

mock.module("../../src/memory/logs", () => ({
  readLogs: mockReadLogs,
  appendLog: mock(() => Promise.resolve()),
}));

// Mock core memory
const mockLoadCoreMemory = mock(() => ({
  persona: "Test persona",
  values: "Test values",
  owner_context: "Test owner",
  system_guide: "",
  communication: "",
}));

mock.module("../../src/memory/core", () => ({
  loadCoreMemory: mockLoadCoreMemory,
}));

// Mock working memory
const mockGetFocus = mock(() => "Test focus");

mock.module("../../src/memory/working", () => ({
  getFocus: mockGetFocus,
  loadWorkingMemory: mock(() => ({
    focus: "Test focus",
    inbox: "",
    commitments: "",
    recentJournal: [],
  })),
}));

// Mock long_term memory
const mockGetScheduledTasks = mock(() => []);
const mockGetGithubRepos = mock(() => []);

mock.module("../../src/memory/long_term", () => ({
  getScheduledTasks: mockGetScheduledTasks,
  getGithubRepos: mockGetGithubRepos,
  saveScheduledTasks: mock(() => {}),
}));

// Now import the module being tested
const { gatherPerchContext } = await import("../../src/perch/context");

afterAll(() => {
  // Clear mocks so other tests can use real modules
  mock.restore();
});

describe("gatherPerchContext", () => {
  beforeEach(() => {
    mockReadLogs.mockClear();
    mockLoadCoreMemory.mockClear();
    mockGetFocus.mockClear();
    mockGetScheduledTasks.mockClear();
    mockGetGithubRepos.mockClear();
    mockCheckGitHubActivity.mockClear();
    mockGetCalendarContext.mockClear();

    // Reset mock implementations
    mockLoadCoreMemory.mockReturnValue({
      persona: "Test persona",
      values: "Test values",
      owner_context: "Test owner",
      system_guide: "",
      communication: "",
    });
    mockGetFocus.mockReturnValue("Test focus");
    mockGetScheduledTasks.mockReturnValue([]);
    mockGetGithubRepos.mockReturnValue([]);
    mockCheckGitHubActivity.mockResolvedValue({ activity: {}, summary: "", hasNew: false });
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
