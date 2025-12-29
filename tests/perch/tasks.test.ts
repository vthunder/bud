import { describe, expect, test } from "bun:test";
import {
  type ScheduledTask,
  parseTasksJson,
  getDueTasks,
  serializeTasksJson,
  createTask,
} from "../../src/perch/tasks";

describe("parseTasksJson", () => {
  test("parses valid JSON array", () => {
    const json = '[{"id":"1","description":"Test","dueAt":"2025-12-29T10:00:00Z"}]';
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
      { id: "1", description: "Due", dueAt: "2025-12-29T10:00:00Z" },
      { id: "2", description: "Not due", dueAt: "2025-12-29T11:00:00Z" },
    ];
    const due = getDueTasks(tasks, now);
    expect(due).toHaveLength(1);
    expect(due[0].id).toBe("1");
  });

  test("returns empty array when nothing due", () => {
    const now = new Date("2025-12-29T09:00:00Z");
    const tasks: ScheduledTask[] = [
      { id: "1", description: "Later", dueAt: "2025-12-29T10:00:00Z" },
    ];
    const due = getDueTasks(tasks, now);
    expect(due).toEqual([]);
  });
});

describe("createTask", () => {
  test("creates task with absolute time", () => {
    const task = createTask("Test reminder", "2025-12-29T15:00:00Z");
    expect(task.description).toBe("Test reminder");
    expect(task.dueAt).toBe("2025-12-29T15:00:00Z");
    expect(task.id).toBeDefined();
  });

  test("creates task with relative time", () => {
    const now = new Date("2025-12-29T10:00:00Z");
    const task = createTask("In 30 minutes", "30m", undefined, now);
    expect(task.dueAt).toBe("2025-12-29T10:30:00.000Z");
  });

  test("creates task with hours relative time", () => {
    const now = new Date("2025-12-29T10:00:00Z");
    const task = createTask("In 2 hours", "2h", undefined, now);
    expect(task.dueAt).toBe("2025-12-29T12:00:00.000Z");
  });

  test("creates recurring task", () => {
    const task = createTask("Weekly check", "2025-12-29T10:00:00Z", "weekly");
    expect(task.recurring).toBe("weekly");
  });
});

describe("serializeTasksJson", () => {
  test("serializes tasks to JSON", () => {
    const tasks: ScheduledTask[] = [
      { id: "1", description: "Test", dueAt: "2025-12-29T10:00:00Z" },
    ];
    const json = serializeTasksJson(tasks);
    expect(json).toBe('[{"id":"1","description":"Test","dueAt":"2025-12-29T10:00:00Z"}]');
  });
});
