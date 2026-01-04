// src/projects/focus.ts
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { config } from "../config";
import type { FocusConfig, FocusProject } from "./types";

const MAX_FOCUS_PROJECTS = 3;

function getFocusPath(): string {
  return join(config.state.path, "3_long_term", "focus.json");
}

function ensureLongTermDir(): void {
  const dir = join(config.state.path, "3_long_term");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export function getFocus(): FocusConfig | null {
  const path = getFocusPath();
  if (!existsSync(path)) return null;

  try {
    return JSON.parse(readFileSync(path, "utf-8")) as FocusConfig;
  } catch {
    return null;
  }
}

export function setFocus(focus: FocusConfig): void {
  ensureLongTermDir();
  writeFileSync(getFocusPath(), JSON.stringify(focus, null, 2));
}

export function addProjectToFocus(project: FocusProject): void {
  const current = getFocus() || { projects: [], updated_at: "" };

  if (current.projects.length >= MAX_FOCUS_PROJECTS) {
    throw new Error(
      `Maximum ${MAX_FOCUS_PROJECTS} projects in focus. Remove one first.`
    );
  }

  // Check if already exists
  const exists = current.projects.some((p) => p.name === project.name);
  if (exists) {
    throw new Error(`Project "${project.name}" is already in focus.`);
  }

  current.projects.push(project);
  current.updated_at = new Date().toISOString();

  setFocus(current);
}

export function removeProjectFromFocus(name: string): void {
  const current = getFocus();
  if (!current) return;

  current.projects = current.projects.filter((p) => p.name !== name);
  current.updated_at = new Date().toISOString();

  setFocus(current);
}

export function getFocusedProjects(): FocusProject[] {
  const focus = getFocus();
  if (!focus) return [];

  return [...focus.projects].sort((a, b) => a.priority - b.priority);
}
