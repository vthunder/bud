import { describe, expect, test, mock, beforeEach } from "bun:test";
import type { PerchContext } from "../../src/perch/context";

// Mock the Claude query
const mockQueryResult = {
  [Symbol.asyncIterator]: async function* () {
    yield {
      type: "result",
      result: "SPEAK: Good morning! Just checking in.",
    };
  },
};
const mockQuery = mock(() => mockQueryResult);

mock.module("@anthropic-ai/claude-agent-sdk", () => ({
  query: mockQuery,
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
  };

  beforeEach(() => {
    mockQuery.mockClear();
  });

  test("returns message when LLM says SPEAK", async () => {
    const result = await decidePerchAction(baseContext);

    expect(result).not.toBeNull();
    expect(result?.message).toBe("Good morning! Just checking in.");
    expect(mockQuery).toHaveBeenCalled();
  });

  test("returns null when LLM says SILENT", async () => {
    mockQuery.mockReturnValueOnce({
      [Symbol.asyncIterator]: async function* () {
        yield { type: "result", result: "SILENT" };
      },
    });

    const result = await decidePerchAction(baseContext);

    expect(result).toBeNull();
  });

  test("returns null on empty response", async () => {
    mockQuery.mockReturnValueOnce({
      [Symbol.asyncIterator]: async function* () {
        yield { type: "result", result: "" };
      },
    });

    const result = await decidePerchAction(baseContext);

    expect(result).toBeNull();
  });
});
