// src/tools/projects.ts
// Utility functions for project management (used by tests and potentially MCP server)

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
 * Create a new project
 */
export function createProject(name: string): void {
  const projectPath = join(getProjectsPath(), name);
  if (projectExists(projectPath)) {
    throw new Error(`Project '${name}' already exists`);
  }
  createProjectFiles(projectPath, name);
}

/**
 * Check if a project exists
 */
export function projectExistsUtil(name: string): boolean {
  const projectPath = join(getProjectsPath(), name);
  return projectExists(projectPath);
}
