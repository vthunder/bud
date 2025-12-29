import { describe, expect, test, mock, beforeEach } from "bun:test";

// Mock Letta client
const mockGetMemoryBlock = mock(() => Promise.resolve("[]"));
const mockSetMemoryBlock = mock(() => Promise.resolve());

mock.module("../../src/memory/letta", () => ({
  getMemoryBlock: mockGetMemoryBlock,
  setMemoryBlock: mockSetMemoryBlock,
  createLettaClient: () => ({}),
}));

const { scheduleTask, cancelTask, listScheduledTasks, markTaskComplete } = await import(
  "../../src/tools/tasks"
);

describe("scheduleTask", () => {
  beforeEach(() => {
    mockGetMemoryBlock.mockClear();
    mockSetMemoryBlock.mockClear();
    mockGetMemoryBlock.mockResolvedValue("[]");
  });

  test("adds a new task to empty list", async () => {
    const result = await scheduleTask(
      {} as any,
      "agent-123",
      "Remind me to check deploy",
      "30m"
    );

    expect(result.success).toBe(true);
    expect(result.task?.description).toBe("Remind me to check deploy");
    expect(mockSetMemoryBlock).toHaveBeenCalled();
  });

  test("adds task to existing list", async () => {
    mockGetMemoryBlock.mockResolvedValue(
      '[{"id":"existing","description":"Old task","dueAt":"2025-12-29T10:00:00Z"}]'
    );

    const result = await scheduleTask(
      {} as any,
      "agent-123",
      "New task",
      "1h"
    );

    expect(result.success).toBe(true);
    const setCall = mockSetMemoryBlock.mock.calls[0];
    const savedTasks = JSON.parse(setCall[3]);
    expect(savedTasks).toHaveLength(2);
  });
});

describe("cancelTask", () => {
  beforeEach(() => {
    mockGetMemoryBlock.mockClear();
    mockSetMemoryBlock.mockClear();
  });

  test("removes task by id", async () => {
    mockGetMemoryBlock.mockResolvedValue(
      '[{"id":"task-1","description":"Task 1","dueAt":"2025-12-29T10:00:00Z"}]'
    );

    const result = await cancelTask({} as any, "agent-123", "task-1");

    expect(result.success).toBe(true);
    const setCall = mockSetMemoryBlock.mock.calls[0];
    const savedTasks = JSON.parse(setCall[3]);
    expect(savedTasks).toHaveLength(0);
  });

  test("returns not found for missing task", async () => {
    mockGetMemoryBlock.mockResolvedValue("[]");

    const result = await cancelTask({} as any, "agent-123", "nonexistent");

    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });
});

describe("listScheduledTasks", () => {
  test("returns all tasks", async () => {
    mockGetMemoryBlock.mockResolvedValue(
      '[{"id":"1","description":"Task 1","dueAt":"2025-12-29T10:00:00Z"}]'
    );

    const result = await listScheduledTasks({} as any, "agent-123");

    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].description).toBe("Task 1");
  });
});

describe("markTaskComplete", () => {
  beforeEach(() => {
    mockGetMemoryBlock.mockClear();
    mockSetMemoryBlock.mockClear();
  });

  test("removes a one-time task when completed", async () => {
    mockGetMemoryBlock.mockResolvedValue(
      '[{"id":"task-1","description":"One-time task","dueAt":"2025-12-29T10:00:00Z"}]'
    );

    const result = await markTaskComplete({} as any, "agent-123", "task-1");

    expect(result.success).toBe(true);
    const setCall = mockSetMemoryBlock.mock.calls[0];
    const savedTasks = JSON.parse(setCall[3]);
    expect(savedTasks).toHaveLength(0);
  });

  test("advances a recurring task when completed", async () => {
    mockGetMemoryBlock.mockResolvedValue(
      '[{"id":"task-1","description":"Daily standup","dueAt":"2025-12-29T10:00:00Z","recurring":"daily"}]'
    );

    const result = await markTaskComplete({} as any, "agent-123", "task-1");

    expect(result.success).toBe(true);
    const setCall = mockSetMemoryBlock.mock.calls[0];
    const savedTasks = JSON.parse(setCall[3]);
    expect(savedTasks).toHaveLength(1);
    // Task should be advanced to next day
    expect(savedTasks[0].dueAt).not.toBe("2025-12-29T10:00:00Z");
  });

  test("returns not found for missing task", async () => {
    mockGetMemoryBlock.mockResolvedValue("[]");

    const result = await markTaskComplete({} as any, "agent-123", "nonexistent");

    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });
});
