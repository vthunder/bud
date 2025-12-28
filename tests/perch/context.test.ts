import { describe, expect, test, mock, beforeEach } from "bun:test";

// Mock dependencies
const mockReadLogs = mock(() => Promise.resolve([]));
const mockLoadContext = mock(() =>
  Promise.resolve({
    persona: "Test persona",
    currentFocus: "Test focus",
    ownerContext: "Test owner",
    timezone: "UTC",
  })
);

mock.module("../../src/memory/logs", () => ({
  readLogs: mockReadLogs,
}));

mock.module("../../src/memory/letta", () => ({
  loadContext: mockLoadContext,
  createLettaClient: () => ({}),
}));

const { gatherPerchContext } = await import("../../src/perch/context");

describe("gatherPerchContext", () => {
  beforeEach(() => {
    mockReadLogs.mockClear();
    mockLoadContext.mockClear();
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
      lettaClient: {} as any,
      agentId: "agent-123",
      now,
    });

    expect(context.currentTime).toBe("2025-12-28T14:00:00.000Z");
    expect(context.hourOfDay).toBe(14);
    expect(context.dayOfWeek).toBe("Sunday");
    expect(context.memory.persona).toBe("Test persona");
    expect(context.recentInteractions).toHaveLength(1);
    expect(context.hoursSinceLastInteraction).toBe(2);
  });

  test("handles no recent interactions", async () => {
    mockReadLogs.mockResolvedValueOnce([]);

    const context = await gatherPerchContext({
      lettaClient: {} as any,
      agentId: "agent-123",
      now: new Date(),
    });

    expect(context.recentInteractions).toHaveLength(0);
    expect(context.hoursSinceLastInteraction).toBeNull();
  });
});
