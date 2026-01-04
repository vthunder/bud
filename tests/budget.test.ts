import { describe, expect, test, beforeEach } from "bun:test";
import {
  getDailyCap,
  setDailyCap,
  getDailySpent,
  setDailySpent,
  trackCost,
  getRemainingBudget,
  checkDailyReset,
  setLastResetDate,
  resetBudgetState,
} from "../src/budget";

beforeEach(() => {
  // Reset to clean state before each test
  resetBudgetState();
});

describe("budget", () => {
  test("getDailyCap returns 0 when not set", () => {
    expect(getDailyCap()).toBe(0);
  });

  test("setDailyCap stores value", () => {
    setDailyCap(5.0);
    expect(getDailyCap()).toBe(5.0);
  });

  test("getDailySpent returns 0 when not set", () => {
    expect(getDailySpent()).toBe(0);
  });

  test("trackCost increments daily spent", () => {
    trackCost(0.25);
    expect(getDailySpent()).toBe(0.25);
    trackCost(0.1);
    expect(getDailySpent()).toBeCloseTo(0.35);
  });

  test("getRemainingBudget calculates correctly", () => {
    setDailyCap(5.0);
    trackCost(1.5);
    expect(getRemainingBudget()).toBe(3.5);
  });

  test("checkDailyReset resets at midnight Berlin", () => {
    setDailyCap(5.0);
    trackCost(2.0);

    // Simulate yesterday's date
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    setLastResetDate(yesterday.toISOString().split("T")[0]);

    checkDailyReset("Europe/Berlin");
    expect(getDailySpent()).toBe(0);
  });
});
