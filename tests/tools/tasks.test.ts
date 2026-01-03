import { describe, expect, test, mock, beforeEach } from "bun:test";

// Mock SQLite blocks module
const mockGetBlock = mock(() => "[]");
const mockSetBlock = mock(() => {});

mock.module("../../src/memory/blocks", () => ({
  getBlock: mockGetBlock,
  setBlock: mockSetBlock,
}));

const { scheduleTask, cancelTask, listScheduledTasks, markTaskComplete } = await import(
  "../../src/tools/tasks"
);

describe("scheduleTask", () => {
  beforeEach(() => {
    mockGetBlock.mockClear();
    mockSetBlock.mockClear();
    mockGetBlock.mockReturnValue("[]");
  });

  test("adds a new task to empty list", () => {
    const result = scheduleTask(
      "Remind me to check deploy",
      "30m"
    );

    expect(result.success).toBe(true);
    expect(result.task?.description).toBe("Remind me to check deploy");
    expect(mockSetBlock).toHaveBeenCalled();
  });

  test("adds task to existing list", () => {
    mockGetBlock.mockReturnValue(
      '[{"id":"existing","description":"Old task","timing":"2025-12-29T10:00:00Z","requiresWakeup":true,"lastRun":null}]'
    );

    const result = scheduleTask(
      "New task",
      "1h"
    );

    expect(result.success).toBe(true);
    const setCall = mockSetBlock.mock.calls[0];
    const savedTasks = JSON.parse(setCall[1]);
    expect(savedTasks).toHaveLength(2);
  });
});

describe("cancelTask", () => {
  beforeEach(() => {
    mockGetBlock.mockClear();
    mockSetBlock.mockClear();
  });

  test("removes task by id", () => {
    mockGetBlock.mockReturnValue(
      '[{"id":"task-1","description":"Task 1","timing":"2025-12-29T10:00:00Z","requiresWakeup":true,"lastRun":null}]'
    );

    const result = cancelTask("task-1");

    expect(result.success).toBe(true);
    const setCall = mockSetBlock.mock.calls[0];
    const savedTasks = JSON.parse(setCall[1]);
    expect(savedTasks).toHaveLength(0);
  });

  test("returns not found for missing task", () => {
    mockGetBlock.mockReturnValue("[]");

    const result = cancelTask("nonexistent");

    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });
});

describe("listScheduledTasks", () => {
  test("returns all tasks", () => {
    mockGetBlock.mockReturnValue(
      '[{"id":"1","description":"Task 1","timing":"2025-12-29T10:00:00Z","requiresWakeup":true,"lastRun":null}]'
    );

    const result = listScheduledTasks();

    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].description).toBe("Task 1");
  });
});

describe("markTaskComplete", () => {
  beforeEach(() => {
    mockGetBlock.mockClear();
    mockSetBlock.mockClear();
  });

  test("removes a one-time task when completed", () => {
    mockGetBlock.mockReturnValue(
      '[{"id":"task-1","description":"One-time task","timing":"2025-12-29T10:00:00Z","requiresWakeup":true,"lastRun":null}]'
    );

    const result = markTaskComplete("task-1");

    expect(result.success).toBe(true);
    const setCall = mockSetBlock.mock.calls[0];
    const savedTasks = JSON.parse(setCall[1]);
    expect(savedTasks).toHaveLength(0);
  });

  test("updates lastRun for a recurring task when completed", () => {
    mockGetBlock.mockReturnValue(
      '[{"id":"task-1","description":"Daily standup","timing":"daily","requiresWakeup":true,"lastRun":null}]'
    );

    const result = markTaskComplete("task-1");

    expect(result.success).toBe(true);
    const setCall = mockSetBlock.mock.calls[0];
    const savedTasks = JSON.parse(setCall[1]);
    expect(savedTasks).toHaveLength(1);
    // Task should have lastRun updated
    expect(savedTasks[0].lastRun).not.toBeNull();
  });

  test("returns not found for missing task", () => {
    mockGetBlock.mockReturnValue("[]");

    const result = markTaskComplete("nonexistent");

    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });
});
