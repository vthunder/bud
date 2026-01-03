import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import {
  type ScheduledTask,
  parseTasksJson,
  getDueTasks,
  serializeTasksJson,
  createTask,
  isTaskDue,
  markTaskRun,
  isOneOffTask,
} from "../../src/perch/tasks";

describe("parseTasksJson", () => {
  test("parses valid JSON array", () => {
    const json = '[{"id":"1","description":"Test","timing":"2025-12-29T10:00:00Z","requiresWakeup":true,"lastRun":null}]';
    const tasks = parseTasksJson(json);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe("1");
  });

  test("returns empty array for invalid JSON", () => {
    const tasks = parseTasksJson("not json");
    expect(tasks).toEqual([]);
  });

  test("returns empty array for empty string", () => {
    const tasks = parseTasksJson("");
    expect(tasks).toEqual([]);
  });
});

describe("getDueTasks", () => {
  test("returns tasks that are due", () => {
    const now = new Date("2025-12-29T10:30:00Z");
    const tasks: ScheduledTask[] = [
      { id: "1", description: "Due", timing: "2025-12-29T10:00:00Z", requiresWakeup: true, lastRun: null },
      { id: "2", description: "Not due", timing: "2025-12-29T11:00:00Z", requiresWakeup: true, lastRun: null },
    ];
    const due = getDueTasks(tasks, now);
    expect(due).toHaveLength(1);
    expect(due[0].id).toBe("1");
  });

  test("returns empty array when nothing due", () => {
    const now = new Date("2025-12-29T09:00:00Z");
    const tasks: ScheduledTask[] = [
      { id: "1", description: "Later", timing: "2025-12-29T10:00:00Z", requiresWakeup: true, lastRun: null },
    ];
    const due = getDueTasks(tasks, now);
    expect(due).toEqual([]);
  });

  test("returns recurring tasks that have never run", () => {
    const now = new Date("2025-12-29T10:30:00Z");
    const tasks: ScheduledTask[] = [
      { id: "1", description: "Daily task", timing: "daily", requiresWakeup: true, lastRun: null },
    ];
    const due = getDueTasks(tasks, now);
    expect(due).toHaveLength(1);
  });

  test("returns recurring tasks when interval passed", () => {
    const now = new Date("2025-12-30T10:30:00Z");
    const tasks: ScheduledTask[] = [
      { id: "1", description: "Daily task", timing: "daily", requiresWakeup: true, lastRun: "2025-12-29T10:30:00Z" },
    ];
    const due = getDueTasks(tasks, now);
    expect(due).toHaveLength(1);
  });

  test("does not return recurring tasks before interval", () => {
    const now = new Date("2025-12-29T15:30:00Z");
    const tasks: ScheduledTask[] = [
      { id: "1", description: "Daily task", timing: "daily", requiresWakeup: true, lastRun: "2025-12-29T10:30:00Z" },
    ];
    const due = getDueTasks(tasks, now);
    expect(due).toHaveLength(0);
  });
});

describe("createTask", () => {
  // Save and restore Date.now for relative time tests
  let originalDateNow: () => number;

  beforeEach(() => {
    originalDateNow = Date.now;
  });

  afterEach(() => {
    Date.now = originalDateNow;
  });

  test("creates task with absolute time", () => {
    const task = createTask("Test reminder", "2025-12-29T15:00:00Z");
    expect(task.description).toBe("Test reminder");
    expect(task.timing).toBe("2025-12-29T15:00:00Z");
    expect(task.id).toBeDefined();
    expect(task.requiresWakeup).toBe(true);
    expect(task.lastRun).toBeNull();
  });

  test("creates task with relative time", () => {
    Date.now = () => new Date("2025-12-29T10:00:00Z").getTime();
    const task = createTask("In 30 minutes", "30m");
    expect(task.timing).toBe("2025-12-29T10:30:00.000Z");
  });

  test("creates task with hours relative time", () => {
    Date.now = () => new Date("2025-12-29T10:00:00Z").getTime();
    const task = createTask("In 2 hours", "2h");
    expect(task.timing).toBe("2025-12-29T12:00:00.000Z");
  });

  test("creates recurring task", () => {
    const task = createTask("Weekly check", "weekly");
    expect(task.timing).toBe("weekly");
    expect(task.requiresWakeup).toBe(true);
  });

  test("creates task with requiresWakeup false", () => {
    const task = createTask("Quiet task", "daily", false);
    expect(task.requiresWakeup).toBe(false);
  });
});

describe("serializeTasksJson", () => {
  test("serializes tasks to JSON", () => {
    const tasks: ScheduledTask[] = [
      { id: "1", description: "Test", timing: "2025-12-29T10:00:00Z", requiresWakeup: true, lastRun: null },
    ];
    const json = serializeTasksJson(tasks);
    const parsed = JSON.parse(json);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe("1");
    expect(parsed[0].timing).toBe("2025-12-29T10:00:00Z");
  });
});

describe("isTaskDue", () => {
  test("exact time task is due when time passed", () => {
    const task: ScheduledTask = { id: "1", description: "Test", timing: "2025-12-29T10:00:00Z", requiresWakeup: true, lastRun: null };
    const now = new Date("2025-12-29T10:30:00Z");
    expect(isTaskDue(task, now)).toBe(true);
  });

  test("exact time task is not due before time", () => {
    const task: ScheduledTask = { id: "1", description: "Test", timing: "2025-12-29T10:00:00Z", requiresWakeup: true, lastRun: null };
    const now = new Date("2025-12-29T09:30:00Z");
    expect(isTaskDue(task, now)).toBe(false);
  });

  test("recurring task is due when never run", () => {
    const task: ScheduledTask = { id: "1", description: "Test", timing: "hourly", requiresWakeup: true, lastRun: null };
    const now = new Date("2025-12-29T10:30:00Z");
    expect(isTaskDue(task, now)).toBe(true);
  });

  test("hourly task is due after 1 hour", () => {
    const task: ScheduledTask = { id: "1", description: "Test", timing: "hourly", requiresWakeup: true, lastRun: "2025-12-29T09:00:00Z" };
    const now = new Date("2025-12-29T10:00:00Z");
    expect(isTaskDue(task, now)).toBe(true);
  });
});

describe("markTaskRun", () => {
  test("updates lastRun timestamp", () => {
    const task: ScheduledTask = { id: "1", description: "Test", timing: "daily", requiresWakeup: true, lastRun: null };
    const now = new Date("2025-12-29T10:00:00Z");
    const updated = markTaskRun(task, now);
    expect(updated.lastRun).toBe("2025-12-29T10:00:00.000Z");
  });
});

describe("isOneOffTask", () => {
  test("returns true for exact time tasks", () => {
    const task: ScheduledTask = { id: "1", description: "Test", timing: "2025-12-29T10:00:00Z", requiresWakeup: true, lastRun: null };
    expect(isOneOffTask(task)).toBe(true);
  });

  test("returns false for recurring tasks", () => {
    const task: ScheduledTask = { id: "1", description: "Test", timing: "daily", requiresWakeup: true, lastRun: null };
    expect(isOneOffTask(task)).toBe(false);
  });
});
