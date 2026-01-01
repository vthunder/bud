// src/projects/focus.ts
import { getBlock, setBlock } from "../memory/blocks";
import type { FocusConfig, FocusProject } from "./types";

const FOCUS_BLOCK_NAME = "focus";
const MAX_FOCUS_PROJECTS = 3;

export function getFocus(): FocusConfig | null {
  const raw = getBlock(FOCUS_BLOCK_NAME);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as FocusConfig;
  } catch {
    return null;
  }
}

export function setFocus(focus: FocusConfig): void {
  setBlock(FOCUS_BLOCK_NAME, JSON.stringify(focus, null, 2), 4);
}

export function addProjectToFocus(project: FocusProject): void {
  const current = getFocus() || { projects: [], updated_at: "" };

  if (current.projects.length >= MAX_FOCUS_PROJECTS) {
    throw new Error(`Maximum ${MAX_FOCUS_PROJECTS} projects in focus. Remove one first.`);
  }

  // Check if already exists
  const exists = current.projects.some(p => p.name === project.name);
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

  current.projects = current.projects.filter(p => p.name !== name);
  current.updated_at = new Date().toISOString();

  setFocus(current);
}

export function getFocusedProjects(): FocusProject[] {
  const focus = getFocus();
  if (!focus) return [];

  return [...focus.projects].sort((a, b) => a.priority - b.priority);
}
