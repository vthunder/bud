/**
 * Long-term Memory (Layer 3)
 *
 * Persistent storage for projects, skills, tasks, and other data.
 * Not automatically loaded into prompts - accessed on-demand.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "fs";
import { join } from "path";
import { config } from "../config";

function getLongTermDir(): string {
  return join(config.state.path, "3_long_term");
}

function ensureLongTermDir(): void {
  const dir = getLongTermDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

// ============ Generic JSON helpers ============

function readJsonFile<T>(filename: string, defaultValue: T): T {
  const path = join(getLongTermDir(), filename);
  if (!existsSync(path)) return defaultValue;
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return defaultValue;
  }
}

function writeJsonFile<T>(filename: string, data: T): void {
  ensureLongTermDir();
  const path = join(getLongTermDir(), filename);
  writeFileSync(path, JSON.stringify(data, null, 2));
}

// ============ Scheduled Tasks ============

export interface ScheduledTask {
  id: string;
  description: string;
  timing: string; // ISO 8601 for exact, or "daily" | "weekly" | "monthly" | "hourly"
  requiresWakeup: boolean;
  lastRun: string | null;
  context?: string;
}

export function getScheduledTasks(): ScheduledTask[] {
  return readJsonFile("scheduled_tasks.json", []);
}

export function saveScheduledTasks(tasks: ScheduledTask[]): void {
  writeJsonFile("scheduled_tasks.json", tasks);
}

// ============ Schedule (recurring patterns) ============

export interface ScheduleEntry {
  id: string;
  name: string;
  pattern: string; // e.g., "daily at 9am", "weekly on Monday"
  description?: string;
}

export function getSchedule(): ScheduleEntry[] {
  return readJsonFile("schedule.json", []);
}

export function saveSchedule(schedule: ScheduleEntry[]): void {
  writeJsonFile("schedule.json", schedule);
}

// ============ GitHub Repos ============

export interface GithubRepo {
  owner: string;
  repo: string;
  checkPRs?: boolean;
  checkIssues?: boolean;
}

export function getGithubRepos(): GithubRepo[] {
  return readJsonFile("github_repos.json", []);
}

export function saveGithubRepos(repos: GithubRepo[]): void {
  writeJsonFile("github_repos.json", repos);
}

// ============ Skills ============

export function getSkillsDir(): string {
  return join(getLongTermDir(), "skills");
}

export function listSkillNames(): string[] {
  const dir = getSkillsDir();
  if (!existsSync(dir)) return [];

  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""));
}

export function getSkillContent(name: string): string | null {
  const path = join(getSkillsDir(), `${name}.md`);
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf-8");
}

// ============ Projects ============

export function getProjectsDir(): string {
  return join(getLongTermDir(), "projects");
}

export function listProjectNames(): string[] {
  const dir = getProjectsDir();
  if (!existsSync(dir)) return [];

  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""));
}

export function getProjectContent(name: string): string | null {
  const path = join(getProjectsDir(), `${name}.md`);
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf-8");
}

export function saveProjectContent(name: string, content: string): void {
  const dir = getProjectsDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(join(dir, `${name}.md`), content);
}
