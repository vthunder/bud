import { describe, expect, test, mock, beforeEach } from "bun:test";

// Mock the SDK before importing our module
const mockRetrieve = mock(() => Promise.resolve({ value: "test value" }));
const mockUpdate = mock(() => Promise.resolve({ value: "updated" }));

mock.module("@letta-ai/letta-client", () => ({
  default: class MockLetta {
    agents = {
      blocks: {
        retrieve: mockRetrieve,
        update: mockUpdate,
      },
    };
  },
}));

// Import after mocking
const { createLettaClient, getMemoryBlock, setMemoryBlock, loadContext } =
  await import("../../src/memory/letta");

describe("Letta client", () => {
  beforeEach(() => {
    mockRetrieve.mockClear();
    mockUpdate.mockClear();
  });

  test("createLettaClient returns configured client", () => {
    const client = createLettaClient({
      baseURL: "http://localhost:8283",
      apiKey: "test-key",
    });
    expect(client).toBeDefined();
    expect(client.agents).toBeDefined();
  });

  test("getMemoryBlock retrieves block by label", async () => {
    mockRetrieve.mockResolvedValueOnce({ value: "persona content" });

    const client = createLettaClient({
      baseURL: "http://localhost:8283",
      apiKey: "test-key",
    });

    const result = await getMemoryBlock(client, "agent-123", "persona");

    expect(mockRetrieve).toHaveBeenCalledWith("persona", {
      agent_id: "agent-123",
    });
    expect(result).toBe("persona content");
  });

  test("getMemoryBlock returns empty string if block not found", async () => {
    mockRetrieve.mockRejectedValueOnce(new Error("Not found"));

    const client = createLettaClient({
      baseURL: "http://localhost:8283",
      apiKey: "test-key",
    });

    const result = await getMemoryBlock(client, "agent-123", "missing");
    expect(result).toBe("");
  });

  test("setMemoryBlock updates block value", async () => {
    mockUpdate.mockResolvedValueOnce({ value: "new content" });

    const client = createLettaClient({
      baseURL: "http://localhost:8283",
      apiKey: "test-key",
    });

    await setMemoryBlock(client, "agent-123", "persona", "new content");

    expect(mockUpdate).toHaveBeenCalledWith("persona", {
      agent_id: "agent-123",
      value: "new content",
    });
  });
});

describe("loadContext", () => {
  beforeEach(() => {
    mockRetrieve.mockClear();
  });

  test("loads all memory blocks into context object", async () => {
    mockRetrieve
      .mockResolvedValueOnce({ value: "I am Bud" })
      .mockResolvedValueOnce({ value: "Working on Phase 2" })
      .mockResolvedValueOnce({ value: "Owner info" })
      .mockResolvedValueOnce({ value: "Europe/Berlin" });

    const client = createLettaClient({
      baseURL: "http://localhost:8283",
      apiKey: "test-key",
    });

    const context = await loadContext(client, "agent-123");

    expect(context.persona).toBe("I am Bud");
    expect(context.currentFocus).toBe("Working on Phase 2");
    expect(context.ownerContext).toBe("Owner info");
    expect(context.timezone).toBe("Europe/Berlin");
  });

  test("returns empty strings for missing blocks", async () => {
    mockRetrieve.mockRejectedValue(new Error("Not found"));

    const client = createLettaClient({
      baseURL: "http://localhost:8283",
      apiKey: "test-key",
    });

    const context = await loadContext(client, "agent-123");

    expect(context.persona).toBe("");
    expect(context.currentFocus).toBe("");
  });
});
