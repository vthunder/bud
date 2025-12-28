import { describe, expect, test, mock, beforeEach } from "bun:test";

// Mock discord.js
const mockSend = mock(() => Promise.resolve({ id: "msg-123" }));
const mockFetch = mock(() =>
  Promise.resolve({ send: mockSend })
);
const mockLogin = mock(() => Promise.resolve("token"));
const mockDestroy = mock(() => Promise.resolve());

mock.module("discord.js", () => ({
  Client: class MockClient {
    channels = { fetch: mockFetch };
    login = mockLogin;
    destroy = mockDestroy;
  },
  GatewayIntentBits: { Guilds: 1 },
}));

const { sendMessage } = await import("../../src/discord/sender");

describe("sendMessage", () => {
  beforeEach(() => {
    mockSend.mockClear();
    mockFetch.mockClear();
    mockLogin.mockClear();
    mockDestroy.mockClear();
  });

  test("sends message to channel and cleans up", async () => {
    mockSend.mockResolvedValueOnce({ id: "msg-456" });

    const result = await sendMessage({
      token: "test-token",
      channelId: "channel-123",
      content: "Hello from perch!",
    });

    expect(mockLogin).toHaveBeenCalledWith("test-token");
    expect(mockFetch).toHaveBeenCalledWith("channel-123");
    expect(mockSend).toHaveBeenCalledWith("Hello from perch!");
    expect(mockDestroy).toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.messageId).toBe("msg-456");
  });

  test("returns error on failure", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Channel not found"));

    const result = await sendMessage({
      token: "test-token",
      channelId: "bad-channel",
      content: "Hello",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Channel not found");
    expect(mockDestroy).toHaveBeenCalled();
  });
});
