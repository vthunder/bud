// tests/config.test.ts
import { describe, expect, test } from "bun:test";
import { config, getProjectsPath } from "../src/config";

describe("config", () => {
  test("has projects path", () => {
    expect(config.projects).toBeDefined();
    expect(config.projects.path).toBeDefined();
  });

  test("getProjectsPath returns path", () => {
    const path = getProjectsPath();
    expect(typeof path).toBe("string");
    expect(path.length).toBeGreaterThan(0);
  });
});
