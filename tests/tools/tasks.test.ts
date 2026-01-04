import { describe, expect, test, mock, beforeEach, afterAll } from "bun:test";

// In-memory task storage for tests
let taskStore: any[] = [];

const mockGetScheduledTasks = mock(() => taskStore);
const mockSaveScheduledTasks = mock((tasks: any[]) => {
  taskStore = tasks;
});

mock.module("../../src/memory/long_term", () => ({
  getScheduledTasks: mockGetScheduledTasks,
  saveScheduledTasks: mockSaveScheduledTasks,
}));

const { scheduleTask, cancelTask, listScheduledTasks, markTaskComplete } = await import(
  "../../src/tools/tasks"
);

afterAll(() => {
  mock.restore();
});

describe("scheduleTask", () => {
  beforeEach(() => {
    taskStore = [];
    mockGetScheduledTasks.mockClear();
    mockSaveScheduledTasks.mockClear();
  });

  test("adds a new task to empty list", () => {
    const result = scheduleTask(
      "Remind me to check deploy",
      "30m"
    );

    expect(result.success).toBe(true);
    expect(result.task?.description).toBe("Remind me to check deploy");
    expect(mockSaveScheduledTasks).toHaveBeenCalled();
    expect(taskStore).toHaveLength(1);
  });

  test("adds task to existing list", () => {
    taskStore = [
      { id: "existing", description: "Old task", timing: "2025-12-29T10:00:00Z", requiresWakeup: true, lastRun: null }
    ];

    const result = scheduleTask(
      "New task",
      "1h"
    );

    expect(result.success).toBe(true);
    expect(taskStore).toHaveLength(2);
  });
});

describe("cancelTask", () => {
  beforeEach(() => {
    taskStore = [];
    mockGetScheduledTasks.mockClear();
    mockSaveScheduledTasks.mockClear();
  });

  test("removes task by id", () => {
    taskStore = [
      { id: "task-1", description: "Task 1", timing: "2025-12-29T10:00:00Z", requiresWakeup: true, lastRun: null }
    ];

    const result = cancelTask("task-1");

    expect(result.success).toBe(true);
    expect(taskStore).toHaveLength(0);
  });

  test("returns not found for missing task", () => {
    taskStore = [];

    const result = cancelTask("nonexistent");

    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });
});

describe("listScheduledTasks", () => {
  beforeEach(() => {
    taskStore = [];
  });

  test("returns all tasks", () => {
    taskStore = [
      { id: "1", description: "Task 1", timing: "2025-12-29T10:00:00Z", requiresWakeup: true, lastRun: null }
    ];

    const result = listScheduledTasks();

    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].description).toBe("Task 1");
  });
});

describe("markTaskComplete", () => {
  beforeEach(() => {
    taskStore = [];
    mockGetScheduledTasks.mockClear();
    mockSaveScheduledTasks.mockClear();
  });

  test("removes a one-time task when completed", () => {
    taskStore = [
      { id: "task-1", description: "One-time task", timing: "2025-12-29T10:00:00Z", requiresWakeup: true, lastRun: null }
    ];

    const result = markTaskComplete("task-1");

    expect(result.success).toBe(true);
    expect(taskStore).toHaveLength(0);
  });

  test("updates lastRun for a recurring task when completed", () => {
    taskStore = [
      { id: "task-1", description: "Daily standup", timing: "daily", requiresWakeup: true, lastRun: null }
    ];

    const result = markTaskComplete("task-1");

    expect(result.success).toBe(true);
    expect(taskStore).toHaveLength(1);
    // Task should have lastRun updated
    expect(taskStore[0].lastRun).not.toBeNull();
  });

  test("returns not found for missing task", () => {
    taskStore = [];

    const result = markTaskComplete("nonexistent");

    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });
});
