// src/tools/projects.ts
import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { readdir } from "fs/promises";
import { join } from "path";
import {
  readProjectNotes,
  readProjectGoals,
  writeProjectNotes,
  createProject as createProjectFiles,
  projectExists,
} from "../projects/files";
import { getProjectsPath } from "../config";
import type { ProjectGoal } from "../projects/types";

/**
 * List all projects in the projects directory
 */
export async function listProjects(projectsPath?: string): Promise<string[]> {
  const path = projectsPath ?? getProjectsPath();
  try {
    const entries = await readdir(path, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

/**
 * Get detailed information about a project
 */
export async function getProjectDetails(
  projectPath: string
): Promise<{ notes: string | null; goals: ProjectGoal[] }> {
  const notes = readProjectNotes(projectPath);
  const goals = readProjectGoals(projectPath);
  return { notes, goals };
}

/**
 * Append content to a project's notes file
 */
export async function updateProjectNotes(
  projectPath: string,
  appendContent: string
): Promise<void> {
  const currentNotes = readProjectNotes(projectPath) ?? "";
  writeProjectNotes(projectPath, currentNotes + appendContent);
}

/**
 * Create the MCP server for project tools
 */
export function createProjectToolsServer() {
  const listProjectsTool = tool(
    "list_projects",
    "List all available projects in the projects directory",
    {},
    async () => {
      try {
        const projects = await listProjects();
        if (projects.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No projects found",
              },
            ],
          };
        }
        return {
          content: [
            {
              type: "text" as const,
              text: `Available projects:\n${projects.map((p) => `- ${p}`).join("\n")}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error listing projects: ${error}`,
            },
          ],
        };
      }
    }
  );

  const getProjectTool = tool(
    "get_project",
    "Get details about a specific project including notes and goals",
    {
      name: z.string().describe("Project name (directory name)"),
    },
    async (args) => {
      try {
        const projectPath = join(getProjectsPath(), args.name);
        if (!projectExists(projectPath)) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Project '${args.name}' not found`,
              },
            ],
          };
        }

        const details = await getProjectDetails(projectPath);
        const goalsText =
          details.goals.length > 0
            ? details.goals
                .map(
                  (g) =>
                    `- [${g.status}] ${g.title} (P${g.priority})${g.deadline ? ` due: ${g.deadline}` : ""}`
                )
                .join("\n")
            : "(no goals)";

        return {
          content: [
            {
              type: "text" as const,
              text: `## ${args.name}\n\n### Notes\n${details.notes ?? "(no notes)"}\n\n### Goals\n${goalsText}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error reading project '${args.name}': ${error}`,
            },
          ],
        };
      }
    }
  );

  const appendProjectNotesTool = tool(
    "append_project_notes",
    "Append content to a project's notes file",
    {
      name: z.string().describe("Project name (directory name)"),
      content: z.string().describe("Content to append to the notes"),
    },
    async (args) => {
      try {
        const projectPath = join(getProjectsPath(), args.name);
        if (!projectExists(projectPath)) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Project '${args.name}' not found`,
              },
            ],
          };
        }

        await updateProjectNotes(projectPath, args.content);
        return {
          content: [
            {
              type: "text" as const,
              text: `Successfully appended content to ${args.name}/notes.md`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error updating project notes: ${error}`,
            },
          ],
        };
      }
    }
  );

  const createProjectTool = tool(
    "create_project",
    "Create a new project with notes.md and goals.md files",
    {
      name: z.string().describe("Project name (will be used as directory name)"),
    },
    async (args) => {
      try {
        const projectPath = join(getProjectsPath(), args.name);
        if (projectExists(projectPath)) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Project '${args.name}' already exists`,
              },
            ],
          };
        }

        createProjectFiles(projectPath, args.name);
        return {
          content: [
            {
              type: "text" as const,
              text: `Created project '${args.name}' with notes.md and goals.md`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error creating project: ${error}`,
            },
          ],
        };
      }
    }
  );

  return createSdkMcpServer({
    name: "bud-projects",
    version: "1.0.0",
    tools: [
      listProjectsTool,
      getProjectTool,
      appendProjectNotesTool,
      createProjectTool,
    ],
  });
}

export const PROJECT_TOOL_NAMES = [
  "mcp__bud-projects__list_projects",
  "mcp__bud-projects__get_project",
  "mcp__bud-projects__append_project_notes",
  "mcp__bud-projects__create_project",
];
