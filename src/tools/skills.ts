import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { readFile, readdir } from "fs/promises";
import { join } from "path";
import { config } from "../config";

export function createSkillToolsServer() {
  const invokeSkillTool = tool(
    "invoke_skill",
    "Load and read a skill's full content. Use this to get instructions for a specific skill.",
    {
      name: z.string().describe("Skill name (e.g., 'sync-state', 'self-improve')"),
    },
    async (args) => {
      try {
        const skillPath = join(config.skills.path, `${args.name}.md`);
        const content = await readFile(skillPath, "utf-8");
        return {
          content: [{
            type: "text" as const,
            text: content,
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text" as const,
            text: `Skill '${args.name}' not found. Available skills can be seen in the Available Skills section of your prompt.`,
          }],
        };
      }
    }
  );

  const listSkillsTool = tool(
    "list_skills",
    "List all available skills with their descriptions",
    {},
    async () => {
      try {
        const files = await readdir(config.skills.path);
        const mdFiles = files.filter((f) => f.endsWith(".md"));

        const skills: string[] = [];
        for (const file of mdFiles) {
          const name = file.replace(".md", "");
          const content = await readFile(join(config.skills.path, file), "utf-8");
          // Extract first line (title) as description
          const firstLine = content.split("\n")[0].replace(/^#\s*/, "");
          skills.push(`- ${name}: ${firstLine}`);
        }

        return {
          content: [{
            type: "text" as const,
            text: skills.length > 0 ? skills.join("\n") : "(no skills available)",
          }],
        };
      } catch {
        return {
          content: [{
            type: "text" as const,
            text: "(error reading skills)",
          }],
        };
      }
    }
  );

  return createSdkMcpServer({
    name: "skills",
    version: "1.0.0",
    tools: [invokeSkillTool, listSkillsTool],
  });
}

export const SKILL_TOOL_NAMES = [
  "mcp__skills__invoke_skill",
  "mcp__skills__list_skills",
];
