import { describe, expect, test } from "bun:test";
import { buildSystemPrompt, type PromptContext } from "../src/prompt";
import type { CoreMemory } from "../src/memory/core";
import type { WorkingMemory } from "../src/memory/working";

describe("buildSystemPrompt", () => {
  const baseCore: CoreMemory = {
    persona: "Test persona",
    values: "Test values",
    owner_context: "Test owner",
    system_guide: "",
    communication: "",
  };

  const baseWorking: WorkingMemory = {
    focus: "Test focus",
    inbox: "",
    commitments: "",
    recentJournal: [],
  };

  const baseContext: PromptContext = {
    core: baseCore,
    working: baseWorking,
    skills: ["skill-a", "skill-b"],
  };

  test("includes identity blocks", () => {
    const prompt = buildSystemPrompt(baseContext);
    expect(prompt).toContain("Test persona");
    expect(prompt).toContain("Test values");
  });

  test("includes working state", () => {
    const prompt = buildSystemPrompt(baseContext);
    expect(prompt).toContain("Test focus");
  });

  test("includes recent journal section", () => {
    const context: PromptContext = {
      ...baseContext,
      working: {
        ...baseWorking,
        recentJournal: [
          { ts: "2025-12-31T10:00:00Z", type: "test", content: "entry1" },
          { ts: "2025-12-31T10:01:00Z", type: "test", content: "entry2" },
        ],
      },
    };
    const prompt = buildSystemPrompt(context);
    expect(prompt).toContain("Recent Activity");
    expect(prompt).toContain("entry1");
  });

  test("includes available skills", () => {
    const prompt = buildSystemPrompt(baseContext);
    expect(prompt).toContain("skill-a");
    expect(prompt).toContain("skill-b");
  });
});
