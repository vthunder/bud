import { describe, expect, test, beforeEach } from "bun:test";
import {
  getState,
  setState,
  requestPreempt,
  clearPreempt,
  shouldYield,
} from "../src/state";

// Reset state before each test by recreating initial state
beforeEach(() => {
  setState({
    status: "idle",
    current_task: null,
    started_at: null,
    session_budget: 0,
    session_spent: 0,
    preempt_requested: false,
    preempt_reason: null,
  });
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
      session_budget: 0.5,
      session_spent: 0,
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
    setState({ status: "working", session_budget: 0.5, session_spent: 0.6 });
    expect(shouldYield()).toBe(true);
  });

  test("shouldYield returns false when budget has room", () => {
    setState({ status: "working", session_budget: 1.0, session_spent: 0.3 });
    expect(shouldYield()).toBe(false);
  });
});
