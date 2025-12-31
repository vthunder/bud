import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import {
  getState,
  setState,
  requestPreempt,
  clearPreempt,
  shouldYield,
  type BudState
} from "../src/state";
import { initDatabase, closeDatabase } from "../src/memory/blocks";
import { rm } from "fs/promises";

const TEST_DB = "/tmp/bud-state-test/memory.db";

beforeEach(async () => {
  await rm("/tmp/bud-state-test", { recursive: true, force: true });
  initDatabase(TEST_DB);
});

afterEach(() => {
  closeDatabase();
});

describe("state", () => {
  test("getState returns idle state when not set", () => {
    const state = getState();
    expect(state.status).toBe("idle");
  });

  test("setState updates state", () => {
    setState({
      status: "working",
      current_task: "Test task",
      started_at: new Date().toISOString(),
      session_budget: 0.50,
      session_spent: 0
    });
    const state = getState();
    expect(state.status).toBe("working");
    expect(state.current_task).toBe("Test task");
  });

  test("requestPreempt sets preempt flag", () => {
    setState({ status: "working", current_task: "Task" });
    requestPreempt("User message");
    const state = getState();
    expect(state.preempt_requested).toBe(true);
    expect(state.preempt_reason).toBe("User message");
  });

  test("clearPreempt resets preempt flag", () => {
    requestPreempt("Test");
    clearPreempt();
    const state = getState();
    expect(state.preempt_requested).toBe(false);
  });

  test("shouldYield returns true when preempt requested", () => {
    setState({ status: "working", session_budget: 1.0, session_spent: 0 });
    requestPreempt("Interrupt");
    expect(shouldYield()).toBe(true);
  });

  test("shouldYield returns true when budget exceeded", () => {
    setState({ status: "working", session_budget: 0.50, session_spent: 0.60 });
    expect(shouldYield()).toBe(true);
  });

  test("shouldYield returns false when budget has room", () => {
    setState({ status: "working", session_budget: 1.0, session_spent: 0.30 });
    expect(shouldYield()).toBe(false);
  });
});
