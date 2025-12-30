import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { loadSkills } from "../src/skills";
import { mkdir, writeFile, rm } from "fs/promises";

describe("loadSkills", () => {
  const testDir = "/tmp/test-skills";

  beforeEach(async () => {
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  test("returns empty string when directory does not exist", async () => {
    const result = await loadSkills("/nonexistent/path");
    expect(result).toBe("");
  });

  test("loads single skill file", async () => {
    await writeFile(`${testDir}/test-skill.md`, "# Test Skill\n\nDo the thing.");
    const result = await loadSkills(testDir);
    expect(result).toContain("# Test Skill");
    expect(result).toContain("Do the thing.");
  });

  test("loads multiple skill files with separators", async () => {
    await writeFile(`${testDir}/skill-a.md`, "# Skill A");
    await writeFile(`${testDir}/skill-b.md`, "# Skill B");
    const result = await loadSkills(testDir);
    expect(result).toContain("# Skill A");
    expect(result).toContain("# Skill B");
    expect(result).toContain("---");
  });

  test("ignores non-markdown files", async () => {
    await writeFile(`${testDir}/skill.md`, "# Real Skill");
    await writeFile(`${testDir}/notes.txt`, "Not a skill");
    const result = await loadSkills(testDir);
    expect(result).toContain("# Real Skill");
    expect(result).not.toContain("Not a skill");
  });
});
