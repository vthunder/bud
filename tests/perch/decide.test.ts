import { describe, expect, test, mock, beforeEach } from "bun:test";
import type { PerchContext } from "../../src/perch/context";

// Mock the ClaudeSession
const mockSendMessage = mock(() =>
  Promise.resolve({
    response: "SPEAK: Good morning! Just checking in.",
    toolsUsed: [],
    totalCost: 0,
  })
);

const mockSession = {
  sendMessage: mockSendMessage,
  ensureSession: mock(() => Promise.resolve()),
};

mock.module("../../src/claude-session", () => ({
  getDefaultSession: () => mockSession,
}));

const { decidePerchAction } = await import("../../src/perch/decide");

describe("decidePerchAction", () => {
  const baseContext: PerchContext = {
    currentTime: "2025-12-29T09:00:00Z",
    hourOfDay: 9,
    dayOfWeek: "Sunday",
    memory: {
      persona: "Helpful assistant",
      currentFocus: "Project work",
      ownerContext: "Works on software",
      timezone: "UTC",
    },
    recentInteractions: [],
    hoursSinceLastInteraction: null,
    dueTasks: [],
    githubSummary: "",
    hasNewGitHub: false,
    calendarSummary: "",
  };

  beforeEach(() => {
    mockSendMessage.mockClear();
  });

  test("returns message when LLM says SPEAK", async () => {
    const result = await decidePerchAction(baseContext);

    expect(result).not.toBeNull();
    expect(result?.message).toBe("Good morning! Just checking in.");
    expect(mockSendMessage).toHaveBeenCalled();
  });

  test("returns null when LLM says SILENT", async () => {
    mockSendMessage.mockResolvedValueOnce({
      response: "SILENT",
      toolsUsed: [],
      totalCost: 0,
    });

    const result = await decidePerchAction(baseContext);

    expect(result).toBeNull();
  });

  test("returns null on empty response", async () => {
    mockSendMessage.mockResolvedValueOnce({
      response: "",
      toolsUsed: [],
      totalCost: 0,
    });

    const result = await decidePerchAction(baseContext);

    expect(result).toBeNull();
  });
});
