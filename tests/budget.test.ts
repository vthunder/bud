import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import {
  getDailyCap,
  setDailyCap,
  getDailySpent,
  trackCost,
  getRemainingBudget,
  checkDailyReset,
} from "../src/budget";
import { initDatabase, closeDatabase, setBlock } from "../src/memory/blocks";
import { rm } from "fs/promises";

const TEST_DB = "/tmp/bud-budget-test/memory.db";

beforeEach(async () => {
  await rm("/tmp/bud-budget-test", { recursive: true, force: true });
  initDatabase(TEST_DB);
});

afterEach(() => {
  closeDatabase();
});

describe("budget", () => {
  test("getDailyCap returns 0 when not set", () => {
    expect(getDailyCap()).toBe(0);
  });

  test("setDailyCap stores value", () => {
    setDailyCap(5.00);
    expect(getDailyCap()).toBe(5.00);
  });

  test("getDailySpent returns 0 when not set", () => {
    expect(getDailySpent()).toBe(0);
  });

  test("trackCost increments daily spent", () => {
    trackCost(0.25);
    expect(getDailySpent()).toBe(0.25);
    trackCost(0.10);
    expect(getDailySpent()).toBe(0.35);
  });

  test("getRemainingBudget calculates correctly", () => {
    setDailyCap(5.00);
    trackCost(1.50);
    expect(getRemainingBudget()).toBe(3.50);
  });

  test("checkDailyReset resets at midnight Berlin", () => {
    setDailyCap(5.00);
    trackCost(2.00);

    // Simulate yesterday's date
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    setBlock("budget_last_reset", yesterday.toISOString().split("T")[0], 4);

    checkDailyReset("Europe/Berlin");
    expect(getDailySpent()).toBe(0);
  });
});
