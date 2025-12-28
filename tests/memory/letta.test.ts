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
const { createLettaClient, getMemoryBlock, setMemoryBlock } = await import(
  "../../src/memory/letta"
);

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
