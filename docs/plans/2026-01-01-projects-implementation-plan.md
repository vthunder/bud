# Projects and Focus-Based Work Selection - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace auto-generated goals with file-based projects, focus pointers, and skill-based work selection.

**Architecture:** Projects are directories with notes/goals files. Focus is a memory block pointing to active projects. The scheduler invokes a `select-work` skill that delegates to specialized selection skills based on project context.

**Tech Stack:** TypeScript, Bun, SQLite (memory blocks), JSONL (journal), Markdown (skills and project files)

---

## Phase 1: Foundation

### Task 1: Add Projects Config

**Files:**
- Modify: `src/config.ts`
- Test: `tests/config.test.ts` (create)

**Step 1: Write the failing test**

```typescript
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
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/config.test.ts`
Expected: FAIL with "config.projects is undefined"

**Step 3: Write minimal implementation**

```typescript
// In src/config.ts, add to config object:
projects: {
  path: process.env.PROJECTS_PATH || "/app/state/projects",
},

// Add helper function:
export function getProjectsPath(): string {
  return config.projects.path;
}
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/config.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/config.ts tests/config.test.ts
git commit -m "feat: add projects path to config"
```

---

### Task 2: Create Project Types

**Files:**
- Create: `src/projects/types.ts`
- Test: `tests/projects/types.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/projects/types.test.ts
import { describe, expect, test } from "bun:test";
import type { Project, FocusConfig, ProjectGoal } from "../../src/projects/types";

describe("project types", () => {
  test("Project type has required fields", () => {
    const project: Project = {
      name: "test-project",
      path: "/path/to/project",
    };
    expect(project.name).toBe("test-project");
    expect(project.path).toBe("/path/to/project");
  });

  test("FocusConfig type has projects array", () => {
    const focus: FocusConfig = {
      projects: [
        { name: "proj1", path: "/p1", priority: 1 },
      ],
      updated_at: new Date().toISOString(),
    };
    expect(focus.projects).toHaveLength(1);
    expect(focus.projects[0].priority).toBe(1);
  });

  test("ProjectGoal type has required fields", () => {
    const goal: ProjectGoal = {
      title: "Ship feature",
      priority: 1,
      status: "active",
    };
    expect(goal.title).toBe("Ship feature");
    expect(goal.status).toBe("active");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/projects/types.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

```typescript
// src/projects/types.ts
export interface Project {
  name: string;
  path: string;
}

export interface FocusProject extends Project {
  priority: number;
  notes?: string;
}

export interface FocusConfig {
  projects: FocusProject[];
  updated_at: string;
}

export interface ProjectGoal {
  title: string;
  priority: number; // 1 = high, 2 = medium, 3 = low
  status: "active" | "completed" | "blocked" | "deferred";
  deadline?: string; // ISO 8601
  links?: string[]; // beads IDs, URLs
  notes?: string;
}

export interface ProjectFiles {
  notes: string | null;
  goals: ProjectGoal[];
  log: string | null;
  links: Record<string, string> | null;
}
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/projects/types.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/projects/types.ts tests/projects/types.test.ts
git commit -m "feat: add project and focus type definitions"
```

---

### Task 3: Create Project File Operations

**Files:**
- Create: `src/projects/files.ts`
- Test: `tests/projects/files.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/projects/files.test.ts
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import {
  projectExists,
  readProjectNotes,
  readProjectGoals,
  writeProjectNotes,
  writeProjectGoals,
  createProject,
} from "../../src/projects/files";

const TEST_DIR = join(import.meta.dir, ".test-projects");

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("project files", () => {
  test("projectExists returns false for non-existent project", () => {
    expect(projectExists(join(TEST_DIR, "nonexistent"))).toBe(false);
  });

  test("createProject creates directory with notes.md and goals.md", () => {
    const projectPath = join(TEST_DIR, "new-project");
    createProject(projectPath, "New Project");

    expect(existsSync(projectPath)).toBe(true);
    expect(existsSync(join(projectPath, "notes.md"))).toBe(true);
    expect(existsSync(join(projectPath, "goals.md"))).toBe(true);
  });

  test("readProjectNotes returns null for missing file", () => {
    const projectPath = join(TEST_DIR, "empty");
    mkdirSync(projectPath);
    expect(readProjectNotes(projectPath)).toBeNull();
  });

  test("readProjectNotes returns content", () => {
    const projectPath = join(TEST_DIR, "with-notes");
    mkdirSync(projectPath);
    writeFileSync(join(projectPath, "notes.md"), "# My Notes\n\nSome content");

    const notes = readProjectNotes(projectPath);
    expect(notes).toContain("My Notes");
  });

  test("writeProjectNotes creates/updates file", () => {
    const projectPath = join(TEST_DIR, "write-notes");
    mkdirSync(projectPath);

    writeProjectNotes(projectPath, "# Updated Notes");
    expect(readProjectNotes(projectPath)).toBe("# Updated Notes");
  });

  test("readProjectGoals returns empty array for missing file", () => {
    const projectPath = join(TEST_DIR, "no-goals");
    mkdirSync(projectPath);
    expect(readProjectGoals(projectPath)).toEqual([]);
  });

  test("writeProjectGoals and readProjectGoals roundtrip", () => {
    const projectPath = join(TEST_DIR, "goals-test");
    mkdirSync(projectPath);

    const goals = [
      { title: "Goal 1", priority: 1, status: "active" as const },
      { title: "Goal 2", priority: 2, status: "completed" as const },
    ];

    writeProjectGoals(projectPath, goals);
    const read = readProjectGoals(projectPath);

    expect(read).toHaveLength(2);
    expect(read[0].title).toBe("Goal 1");
    expect(read[1].status).toBe("completed");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/projects/files.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

```typescript
// src/projects/files.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import type { ProjectGoal } from "./types";

export function projectExists(projectPath: string): boolean {
  return existsSync(projectPath);
}

export function createProject(projectPath: string, name: string): void {
  mkdirSync(projectPath, { recursive: true });

  const notesContent = `# ${name}\n\n## Notes\n\n(Add project notes here)\n`;
  const goalsContent = `# Goals for ${name}\n\n## Active\n\n(No active goals yet)\n\n## Completed\n\n`;

  writeFileSync(join(projectPath, "notes.md"), notesContent);
  writeFileSync(join(projectPath, "goals.md"), goalsContent);
}

export function readProjectNotes(projectPath: string): string | null {
  const notesPath = join(projectPath, "notes.md");
  if (!existsSync(notesPath)) return null;
  return readFileSync(notesPath, "utf-8");
}

export function writeProjectNotes(projectPath: string, content: string): void {
  writeFileSync(join(projectPath, "notes.md"), content);
}

export function readProjectGoals(projectPath: string): ProjectGoal[] {
  const goalsPath = join(projectPath, "goals.md");
  if (!existsSync(goalsPath)) return [];

  const content = readFileSync(goalsPath, "utf-8");
  return parseGoalsMarkdown(content);
}

export function writeProjectGoals(projectPath: string, goals: ProjectGoal[]): void {
  const content = serializeGoalsMarkdown(goals);
  writeFileSync(join(projectPath, "goals.md"), content);
}

function parseGoalsMarkdown(content: string): ProjectGoal[] {
  const goals: ProjectGoal[] = [];
  const lines = content.split("\n");

  let currentStatus: "active" | "completed" | "blocked" | "deferred" = "active";
  let currentGoal: Partial<ProjectGoal> | null = null;

  for (const line of lines) {
    // Section headers
    if (line.match(/^##\s*Active/i)) {
      currentStatus = "active";
      continue;
    }
    if (line.match(/^##\s*Completed/i)) {
      currentStatus = "completed";
      continue;
    }
    if (line.match(/^##\s*Blocked/i)) {
      currentStatus = "blocked";
      continue;
    }
    if (line.match(/^##\s*Deferred/i)) {
      currentStatus = "deferred";
      continue;
    }

    // Goal title (h3)
    const titleMatch = line.match(/^###\s+(.+)$/);
    if (titleMatch) {
      if (currentGoal && currentGoal.title) {
        goals.push(currentGoal as ProjectGoal);
      }
      currentGoal = {
        title: titleMatch[1],
        status: currentStatus,
        priority: 2, // default
      };
      continue;
    }

    // Goal properties
    if (currentGoal) {
      const priorityMatch = line.match(/^-\s*Priority:\s*(\d+)/i);
      if (priorityMatch) {
        currentGoal.priority = parseInt(priorityMatch[1], 10);
      }

      const deadlineMatch = line.match(/^-\s*Deadline:\s*(.+)/i);
      if (deadlineMatch) {
        currentGoal.deadline = deadlineMatch[1].trim();
      }

      const linksMatch = line.match(/^-\s*Links:\s*(.+)/i);
      if (linksMatch) {
        currentGoal.links = linksMatch[1].split(",").map(s => s.trim());
      }

      const notesMatch = line.match(/^-\s*Notes:\s*(.+)/i);
      if (notesMatch) {
        currentGoal.notes = notesMatch[1].trim();
      }
    }
  }

  // Don't forget last goal
  if (currentGoal && currentGoal.title) {
    goals.push(currentGoal as ProjectGoal);
  }

  return goals;
}

function serializeGoalsMarkdown(goals: ProjectGoal[]): string {
  const sections: Record<string, ProjectGoal[]> = {
    active: [],
    completed: [],
    blocked: [],
    deferred: [],
  };

  for (const goal of goals) {
    sections[goal.status].push(goal);
  }

  let content = "# Goals\n\n";

  for (const [status, statusGoals] of Object.entries(sections)) {
    if (statusGoals.length === 0 && status !== "active") continue;

    content += `## ${status.charAt(0).toUpperCase() + status.slice(1)}\n\n`;

    if (statusGoals.length === 0) {
      content += "(No goals)\n\n";
      continue;
    }

    for (const goal of statusGoals) {
      content += `### ${goal.title}\n`;
      content += `- Priority: ${goal.priority}\n`;
      if (goal.deadline) content += `- Deadline: ${goal.deadline}\n`;
      if (goal.links?.length) content += `- Links: ${goal.links.join(", ")}\n`;
      if (goal.notes) content += `- Notes: ${goal.notes}\n`;
      content += "\n";
    }
  }

  return content;
}
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/projects/files.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/projects/files.ts tests/projects/files.test.ts
git commit -m "feat: add project file operations"
```

---

### Task 4: Create Focus Manager

**Files:**
- Create: `src/projects/focus.ts`
- Test: `tests/projects/focus.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/projects/focus.test.ts
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync } from "fs";
import { join } from "path";
import { initDatabase, closeDatabase } from "../../src/memory/blocks";
import {
  getFocus,
  setFocus,
  addProjectToFocus,
  removeProjectFromFocus,
  getFocusedProjects,
} from "../../src/projects/focus";

const TEST_DIR = join(import.meta.dir, ".test-focus");
const TEST_DB = join(TEST_DIR, "test.db");

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
  initDatabase(TEST_DB);
});

afterEach(() => {
  closeDatabase();
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("focus manager", () => {
  test("getFocus returns null when not set", () => {
    expect(getFocus()).toBeNull();
  });

  test("setFocus and getFocus roundtrip", () => {
    const focus = {
      projects: [
        { name: "proj1", path: "/p1", priority: 1 },
      ],
      updated_at: new Date().toISOString(),
    };

    setFocus(focus);
    const read = getFocus();

    expect(read).not.toBeNull();
    expect(read!.projects).toHaveLength(1);
    expect(read!.projects[0].name).toBe("proj1");
  });

  test("addProjectToFocus adds to empty focus", () => {
    addProjectToFocus({ name: "new", path: "/new", priority: 1 });

    const focus = getFocus();
    expect(focus!.projects).toHaveLength(1);
  });

  test("addProjectToFocus respects max 3 projects", () => {
    addProjectToFocus({ name: "p1", path: "/p1", priority: 1 });
    addProjectToFocus({ name: "p2", path: "/p2", priority: 2 });
    addProjectToFocus({ name: "p3", path: "/p3", priority: 3 });

    expect(() => {
      addProjectToFocus({ name: "p4", path: "/p4", priority: 4 });
    }).toThrow(/maximum/i);
  });

  test("removeProjectFromFocus removes by name", () => {
    addProjectToFocus({ name: "p1", path: "/p1", priority: 1 });
    addProjectToFocus({ name: "p2", path: "/p2", priority: 2 });

    removeProjectFromFocus("p1");

    const focus = getFocus();
    expect(focus!.projects).toHaveLength(1);
    expect(focus!.projects[0].name).toBe("p2");
  });

  test("getFocusedProjects returns sorted by priority", () => {
    addProjectToFocus({ name: "low", path: "/low", priority: 3 });
    addProjectToFocus({ name: "high", path: "/high", priority: 1 });

    const projects = getFocusedProjects();
    expect(projects[0].name).toBe("high");
    expect(projects[1].name).toBe("low");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/projects/focus.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

```typescript
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
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/projects/focus.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/projects/focus.ts tests/projects/focus.test.ts
git commit -m "feat: add focus manager for active projects"
```

---

### Task 5: Create select-work Skill

**Files:**
- Create: `state/skills/select-work.md`

**Step 1: Create the skill file**

```markdown
# Select Work

Entry point skill for autonomous work selection during perch ticks.

## When to Use

This skill is invoked automatically by the scheduler when Bud wakes up for autonomous work.

## Process

1. **Read focus**: Get current focused projects from memory block
2. **For each project** (in priority order):
   - Read the project's `notes.md` and `goals.md`
   - Identify what kind of work is needed based on context
   - Delegate to appropriate selection skill
3. **Return selected work** with context and estimated cost

## Selection Logic

Look at the project's notes and goals to determine what kind of work is needed:

- **If goals mention beads issues or repo work**: Use `select-coding-work` skill
- **If goals mention research or learning**: Use `select-research` skill
- **If goals mention writing or documentation**: Use `select-writing` skill
- **If unclear**: Pick the highest priority active goal and work on it directly

## Output Format

Return a work item with:
- `project`: Name of the project
- `description`: What to work on
- `context`: Relevant notes, goals, links
- `estimated_cost`: Estimated budget for this work
- `skill_hint`: Suggested approach (coding, research, writing, etc.)

## Example

```
Checking focus...
- browserid-ng (priority 1): Primary IdP support
- research-memory (priority 2): Hierarchical memory design

Evaluating browserid-ng:
- Goals: "Ship primary IdP support" with links to beads:BID-5
- Notes mention implementation work
- Delegating to select-coding-work...

Selected: BID-5 - Email selection should use stored certs
Estimated cost: $0.75
```
```

**Step 2: Commit**

```bash
git add state/skills/select-work.md
git commit -m "feat: add select-work skill for autonomous work selection"
```

---

### Task 6: Create select-coding-work Skill

**Files:**
- Create: `state/skills/select-coding-work.md`

**Step 1: Create the skill file**

```markdown
# Select Coding Work

Skill for selecting coding tasks from a project's beads database.

## When to Use

Called by `select-work` when a project involves code/repo work.

## Prerequisites

The project must have a `links.md` file with a `beads` entry pointing to the beads database path, or the repo must have a `.beads` directory.

## Process

1. **Find beads database**: Check project's `links.md` for beads path, or look for `.beads` in linked repo
2. **Query ready tasks**: Use `beads:ready` to get unblocked tasks
3. **Filter by project**: If project has labels defined, filter to matching tasks
4. **Select top task**: Pick highest priority ready task
5. **Get full context**: Use `beads:show` to get task details

## Output

Return:
- Task ID and title
- Full task description and acceptance criteria
- Any linked issues or context
- Estimated complexity/cost

## Example

```
Finding beads for browserid-ng...
Beads path: /Users/thunder/src/browserid-ng/.beads

Querying ready tasks...
Found 3 ready tasks:
1. BID-5 (P1): Email selection should use stored certs
2. BID-12 (P2): Add error handling tests
3. BID-15 (P3): Document deployment process

Selected: BID-5
Context: Primary IdP flow needs to check localStorage for existing cert...
Estimated cost: $0.75 (medium complexity)
```

## No Ready Tasks

If no ready tasks:
1. Check if there are blocked tasks and report what's blocking
2. Suggest the project may need goal review
3. Return null to let scheduler try next project
```

**Step 2: Commit**

```bash
git add state/skills/select-coding-work.md
git commit -m "feat: add select-coding-work skill for beads integration"
```

---

### Task 7: Update Work Selector to Use Skills

**Files:**
- Modify: `src/perch/work.ts`
- Test: `tests/perch/work.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/perch/work.test.ts - add new test
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync } from "fs";
import { join } from "path";
import { initDatabase, setBlock, closeDatabase } from "../../src/memory/blocks";
import { initJournal } from "../../src/memory/journal";
import { selectWork } from "../../src/perch/work";

const TEST_DIR = join(import.meta.dir, ".test-work");
const TEST_DB = join(TEST_DIR, "test.db");
const TEST_JOURNAL = join(TEST_DIR, "journal.jsonl");

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
  initDatabase(TEST_DB);
  initJournal(TEST_JOURNAL);
  // Set budget
  setBlock("budget_daily_cap", "10.00", 4);
  setBlock("budget_daily_spent", "0.00", 4);
});

afterEach(() => {
  closeDatabase();
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("selectWork with focus", () => {
  test("returns skill-based work when focus is set", async () => {
    // Set up focus with a project
    const focus = {
      projects: [
        { name: "test-project", path: "/test/path", priority: 1 },
      ],
      updated_at: new Date().toISOString(),
    };
    setBlock("focus", JSON.stringify(focus), 4);

    const work = await selectWork([]);

    expect(work).not.toBeNull();
    expect(work!.type).toBe("goal");
    expect(work!.context).toContain("select-work");
  });

  test("falls back to maintenance when no focus", async () => {
    // No focus set, should fall back to maintenance check
    const work = await selectWork([]);
    // Will be null or maintenance depending on last sync time
    expect(work === null || work.type === "maintenance").toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/perch/work.test.ts`
Expected: FAIL (current implementation doesn't check focus)

**Step 3: Write minimal implementation**

```typescript
// src/perch/work.ts - updated version
import { getBlock } from "../memory/blocks";
import { searchJournal } from "../memory/journal";
import { getRemainingBudget } from "../budget";
import { getFocus, getFocusedProjects } from "../projects/focus";

export interface WorkItem {
  type: "scheduled_task" | "goal" | "maintenance";
  id: string;
  description: string;
  context: string;
  estimatedBudget: number;
}

export async function selectWork(
  scheduledTasks: Array<{ id: string; description: string; context?: string }>
): Promise<WorkItem | null> {
  const remaining = getRemainingBudget();

  if (remaining <= 0) {
    return null;
  }

  // Priority 1: Scheduled tasks that are due
  if (scheduledTasks.length > 0) {
    const task = scheduledTasks[0];
    return {
      type: "scheduled_task",
      id: task.id,
      description: task.description,
      context: task.context || "",
      estimatedBudget: Math.min(0.50, remaining),
    };
  }

  // Priority 2: Focus-based work (invoke select-work skill)
  const focus = getFocus();
  if (focus && focus.projects.length > 0) {
    const focusedProjects = getFocusedProjects();
    const topProject = focusedProjects[0];

    // Return work item that tells the agent to use select-work skill
    return {
      type: "goal",
      id: `project-${topProject.name}`,
      description: `Work on ${topProject.name}`,
      context: buildFocusContext(focusedProjects),
      estimatedBudget: Math.min(1.00, remaining),
    };
  }

  // Priority 3: Legacy goals block (backwards compatibility)
  const goals = getBlock("goals");
  if (goals && goals !== "(No active goals.)") {
    return {
      type: "goal",
      id: "goal-work",
      description: "Work on active goals",
      context: goals,
      estimatedBudget: Math.min(1.00, remaining),
    };
  }

  // Priority 4: Maintenance
  const lastSync = await getLastSyncTime();
  const hoursSinceSync = lastSync
    ? (Date.now() - new Date(lastSync).getTime()) / (1000 * 60 * 60)
    : 999;

  if (hoursSinceSync > 24) {
    return {
      type: "maintenance",
      id: "sync-state",
      description: "Sync state to GitHub",
      context: "Daily backup",
      estimatedBudget: Math.min(0.10, remaining),
    };
  }

  return null;
}

function buildFocusContext(projects: Array<{ name: string; path: string; priority: number; notes?: string }>): string {
  let context = "## Focused Projects\n\n";
  context += "Use the `select-work` skill to evaluate these projects and select work.\n\n";

  for (const p of projects) {
    context += `### ${p.name} (priority ${p.priority})\n`;
    context += `- Path: ${p.path}\n`;
    if (p.notes) context += `- Notes: ${p.notes}\n`;
    context += "\n";
  }

  return context;
}

async function getLastSyncTime(): Promise<string | null> {
  const entries = await searchJournal(e =>
    e.type === "sync" ||
    (e.type === "tool_use" && e.tool === "sync-state") ||
    (e.type === "work_completed" && e.work_type === "maintenance" && e.description === "Sync state to GitHub")
  );

  return entries.length > 0 ? entries[entries.length - 1].ts : null;
}
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/perch/work.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/perch/work.ts tests/perch/work.test.ts
git commit -m "feat: integrate focus-based work selection"
```

---

## Phase 2: Project Management Skills

### Task 8: Create project-review Skill

**Files:**
- Create: `state/skills/project-review.md`

**Step 1: Create the skill file**

```markdown
# Project Review

Interactive skill for reviewing a project's state and updating goals.

## When to Use

- User invokes `/project-review <project-name>`
- Or autonomously during async review cycles

## Process

1. **Load project files**: Read notes.md, goals.md, log.md from project directory
2. **Synthesize progress**: Identify what's been accomplished since last review
3. **Present current state**:
   - Summary of notes
   - Active goals with status
   - Recent log entries
4. **Propose updates**:
   - Goals that appear complete
   - New goals implied by notes
   - Priority adjustments
5. **Get confirmation**: If interactive, ask user to confirm changes
6. **Update files**: Write changes to goals.md, append to log.md

## Output Format

```
## Project Review: [project-name]

### Progress Since Last Review
- [What's been accomplished]
- [Changes in status]

### Current Goals
1. [Goal 1] - Priority X - [Status]
2. [Goal 2] - Priority Y - [Status]

### Suggested Updates
- [ ] Mark "[goal]" as completed
- [ ] Add new goal: "[description]"
- [ ] Reprioritize "[goal]" from X to Y

Confirm these updates? (or suggest changes)
```

## Async Mode

When running autonomously (not interactive):
1. Make high-confidence updates automatically
2. Queue low-confidence changes for Discord notification
3. Log all changes to project's log.md
```

**Step 2: Commit**

```bash
git add state/skills/project-review.md
git commit -m "feat: add project-review skill"
```

---

### Task 9: Create project-status Skill

**Files:**
- Create: `state/skills/project-status.md`

**Step 1: Create the skill file**

```markdown
# Project Status

Quick status summary for a project.

## When to Use

- User asks "what's the status of [project]?"
- User invokes `/project-status <project-name>`
- Called by other skills needing project context

## Process

1. **Load project**: Read notes.md and goals.md
2. **Summarize**:
   - Active goals count and top priority
   - Recent activity (from log.md if exists)
   - Key notes/context
3. **Return concise summary**

## Output Format

```
**[project-name]** - [one-line description from notes]

Active Goals: X | Completed: Y | Blocked: Z

Top Priority: [goal title] (P1)
- [brief status/next step]

Last Activity: [date] - [what happened]
```

## Example

```
**browserid-ng** - BrowserID implementation for modern web

Active Goals: 2 | Completed: 5 | Blocked: 0

Top Priority: Ship primary IdP support (P1)
- BID-5 in progress, email selection fix

Last Activity: 2026-01-01 - Completed popup auth resilience
```
```

**Step 2: Commit**

```bash
git add state/skills/project-status.md
git commit -m "feat: add project-status skill"
```

---

### Task 10: Create create-project Skill

**Files:**
- Create: `state/skills/create-project.md`

**Step 1: Create the skill file**

```markdown
# Create Project

Skill for setting up a new project.

## When to Use

- User says "let's start a new project for X"
- User invokes `/create-project <name>`

## Process

1. **Gather info**:
   - Project name (kebab-case)
   - Brief description
   - Initial goals (optional)
   - Links to repos, resources (optional)
2. **Create directory**: `{projects_path}/{name}/`
3. **Create files**:
   - `notes.md` - Initial notes with description
   - `goals.md` - Initial goals (or empty template)
   - `links.md` - Any linked resources
4. **Offer to add to focus**: Ask if this should be a focused project

## Directory Structure

```
{projects_path}/{name}/
├── notes.md      # Project notes and context
├── goals.md      # Goals in markdown format
├── links.md      # Links to repos, beads, docs
└── log.md        # Activity log (created on first entry)
```

## Example Interaction

```
User: Let's create a project for the bud scheduler redesign

Bud: I'll create a new project. Let me gather some details:

**Name:** bud-scheduler-redesign
**Description:** Redesign the perch scheduler to use skill-based work selection

Any initial goals?

User: Yes - implement focus-based selection, add project-review skill

Bud: Created project at ~/.bud/projects/bud-scheduler-redesign/
- notes.md with description
- goals.md with 2 initial goals
- links.md (empty, add repos/resources later)

Add to focus? Currently 1/3 slots used.
```
```

**Step 2: Commit**

```bash
git add state/skills/create-project.md
git commit -m "feat: add create-project skill"
```

---

### Task 11: Create update-focus Skill

**Files:**
- Create: `state/skills/update-focus.md`

**Step 1: Create the skill file**

```markdown
# Update Focus

Skill for managing which projects are in focus.

## When to Use

- User says "focus on X" or "add X to focus"
- User says "remove X from focus" or "stop focusing on X"
- User asks "what am I focused on?"

## Commands

### Show Focus
"What am I focused on?" / "Show focus"

```
Current Focus (2/3 slots):
1. browserid-ng (P1) - Primary IdP support
2. bud-scheduler (P2) - Scheduler redesign

Available slot for 1 more project.
```

### Add to Focus
"Focus on [project]" / "Add [project] to focus"

- Check project exists
- Check slots available (max 3)
- Add with specified or default priority
- Confirm change

### Remove from Focus
"Remove [project] from focus" / "Unfocus [project]"

- Remove from focus list
- Project files remain unchanged
- Confirm change

### Reprioritize
"Make [project] priority 1" / "Reprioritize [project]"

- Update priority in focus config
- Re-sort list
- Confirm change

## Constraints

- Maximum 3 projects in focus
- Projects not in focus can still be worked on interactively
- Focus determines what Bud works on autonomously
```

**Step 2: Commit**

```bash
git add state/skills/update-focus.md
git commit -m "feat: add update-focus skill"
```

---

## Phase 3: Synthesis Skills

### Task 12: Create synthesize-to-project Skill

**Files:**
- Create: `state/skills/synthesize-to-project.md`

**Step 1: Create the skill file**

```markdown
# Synthesize to Project

Extract insights from conversation and save to project files.

## When to Use

- User invokes `/synthesize-to-project <project-name>`
- After a substantive discussion about a project
- When user says "save this to the project notes"

## Process

1. **Identify scope**: Look backward through conversation to find relevant content
   - Stop at: previous `/synthesize`, topic change, session start, or ~50 messages
   - Include: decisions, insights, requirements, design discussions
2. **Extract insights**:
   - Key decisions made
   - New requirements or constraints
   - Design choices and rationale
   - Open questions
   - Action items
3. **Categorize**:
   - Notes (general insights) → append to notes.md
   - Goals (action items) → suggest additions to goals.md
   - Links (resources mentioned) → add to links.md
4. **Write to files**: Append to appropriate project files
5. **Confirm**: Show what was extracted and where it was saved

## Scope Detection

The skill automatically determines how far back to look:

```
Looking for conversation scope...
- Found topic shift at message 12 (switched from browserid to scheduling)
- Extracting from messages 1-12

Extracted:
- 3 design decisions
- 1 new requirement
- 2 open questions
```

## Output Format

```
## Synthesized from conversation

### Decisions
- Use popup for IdP auth instead of redirect (resilience)
- 2-minute timeout for auth attempts

### New Requirements
- Dialog must handle popup blockers gracefully

### Open Questions
- Should we retry on timeout automatically?

Saved to: browserid-ng/notes.md
Suggested goal update: "Add popup blocker handling" (Priority 2)
```

## No Manual Markers Needed

The skill should figure out scope from context. It looks for:
- Explicit project mentions
- Topic continuity
- Natural conversation boundaries
- Time gaps between messages
```

**Step 2: Commit**

```bash
git add state/skills/synthesize-to-project.md
git commit -m "feat: add synthesize-to-project skill"
```

---

### Task 13: Create select-research Skill

**Files:**
- Create: `state/skills/select-research.md`

**Step 1: Create the skill file**

```markdown
# Select Research

Skill for selecting research tasks from a project.

## When to Use

Called by `select-work` when a project's goals involve research, learning, or exploration.

## Indicators

A goal is research-oriented if it mentions:
- "research", "investigate", "explore", "learn"
- "understand", "analyze", "compare"
- "read", "review", "study"
- References to papers, docs, articles

## Process

1. **Identify research goals**: Find active goals with research indicators
2. **Check progress**: Look at notes.md for existing findings
3. **Determine next step**:
   - If no sources gathered: Find and list sources
   - If sources exist but not reviewed: Review next source
   - If reviewed but not synthesized: Write synthesis
   - If synthesized: Check if questions answered, or identify follow-ups
4. **Return work item**: Specific next research action

## Output

```
Research goal: "Understand hierarchical memory approaches"

Progress:
- Sources: 3 papers identified, 1 reviewed
- Findings: Initial notes on sliding window approach

Next step: Review paper #2 "Retrieval-Augmented Generation"
Estimated cost: $0.30 (reading + notes)
```

## Research Cycle

```
┌─────────────┐
│ Identify    │
│ Questions   │
└──────┬──────┘
       ▼
┌─────────────┐
│ Gather      │
│ Sources     │
└──────┬──────┘
       ▼
┌─────────────┐
│ Review      │
│ Sources     │
└──────┬──────┘
       ▼
┌─────────────┐
│ Synthesize  │
│ Findings    │
└──────┬──────┘
       ▼
┌─────────────┐
│ Answer or   │
│ New Questions│
└─────────────┘
```
```

**Step 2: Commit**

```bash
git add state/skills/select-research.md
git commit -m "feat: add select-research skill"
```

---

## Phase 4: Async Loop

### Task 14: Create Project Tools Server

**Files:**
- Create: `src/tools/projects.ts`
- Test: `tests/tools/projects.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/tools/projects.test.ts
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { initDatabase, closeDatabase } from "../../src/memory/blocks";

// We'll test the tool functions directly
import {
  listProjects,
  getProjectDetails,
  updateProjectNotes,
  updateProjectGoals,
} from "../../src/tools/projects";

const TEST_DIR = join(import.meta.dir, ".test-project-tools");
const TEST_DB = join(TEST_DIR, "test.db");
const TEST_PROJECTS = join(TEST_DIR, "projects");

beforeEach(() => {
  mkdirSync(TEST_PROJECTS, { recursive: true });
  initDatabase(TEST_DB);

  // Create a test project
  const projPath = join(TEST_PROJECTS, "test-proj");
  mkdirSync(projPath);
  writeFileSync(join(projPath, "notes.md"), "# Test Project\n\nSome notes");
  writeFileSync(join(projPath, "goals.md"), "# Goals\n\n## Active\n\n### Goal 1\n- Priority: 1");
});

afterEach(() => {
  closeDatabase();
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("project tools", () => {
  test("listProjects returns project names", async () => {
    const result = await listProjects(TEST_PROJECTS);
    expect(result).toContain("test-proj");
  });

  test("getProjectDetails returns notes and goals", async () => {
    const details = await getProjectDetails(join(TEST_PROJECTS, "test-proj"));
    expect(details.notes).toContain("Test Project");
    expect(details.goals).toHaveLength(1);
    expect(details.goals[0].title).toBe("Goal 1");
  });

  test("updateProjectNotes appends content", async () => {
    await updateProjectNotes(join(TEST_PROJECTS, "test-proj"), "\n\n## New Section\n\nNew content");
    const details = await getProjectDetails(join(TEST_PROJECTS, "test-proj"));
    expect(details.notes).toContain("New Section");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/tools/projects.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write minimal implementation**

```typescript
// src/tools/projects.ts
import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { readdir } from "fs/promises";
import { join } from "path";
import { config, getProjectsPath } from "../config";
import {
  readProjectNotes,
  readProjectGoals,
  writeProjectNotes,
  writeProjectGoals,
  createProject as createProjectDir,
  projectExists,
} from "../projects/files";
import type { ProjectGoal } from "../projects/types";

export async function listProjects(projectsPath?: string): Promise<string[]> {
  const path = projectsPath || getProjectsPath();
  try {
    const entries = await readdir(path, { withFileTypes: true });
    return entries.filter(e => e.isDirectory()).map(e => e.name);
  } catch {
    return [];
  }
}

export async function getProjectDetails(projectPath: string): Promise<{
  notes: string | null;
  goals: ProjectGoal[];
}> {
  return {
    notes: readProjectNotes(projectPath),
    goals: readProjectGoals(projectPath),
  };
}

export async function updateProjectNotes(projectPath: string, appendContent: string): Promise<void> {
  const current = readProjectNotes(projectPath) || "";
  writeProjectNotes(projectPath, current + appendContent);
}

export function createProjectToolsServer() {
  const listProjectsTool = tool(
    "list_projects",
    "List all available projects",
    {},
    async () => {
      const projects = await listProjects();
      return {
        content: [{
          type: "text" as const,
          text: projects.length > 0
            ? `Projects:\n${projects.map(p => `- ${p}`).join("\n")}`
            : "(no projects)",
        }],
      };
    }
  );

  const getProjectTool = tool(
    "get_project",
    "Get details about a specific project including notes and goals",
    {
      name: z.string().describe("Project name"),
    },
    async (args) => {
      const projectPath = join(getProjectsPath(), args.name);
      if (!projectExists(projectPath)) {
        return {
          content: [{
            type: "text" as const,
            text: `Project "${args.name}" not found.`,
          }],
        };
      }

      const details = await getProjectDetails(projectPath);
      let text = `# ${args.name}\n\n`;
      text += `## Notes\n${details.notes || "(no notes)"}\n\n`;
      text += `## Goals\n`;
      if (details.goals.length === 0) {
        text += "(no goals)\n";
      } else {
        for (const g of details.goals) {
          text += `- [${g.status}] ${g.title} (P${g.priority})\n`;
        }
      }

      return {
        content: [{ type: "text" as const, text }],
      };
    }
  );

  const appendNotesTool = tool(
    "append_project_notes",
    "Append content to a project's notes.md file",
    {
      name: z.string().describe("Project name"),
      content: z.string().describe("Content to append"),
    },
    async (args) => {
      const projectPath = join(getProjectsPath(), args.name);
      if (!projectExists(projectPath)) {
        return {
          content: [{
            type: "text" as const,
            text: `Project "${args.name}" not found.`,
          }],
        };
      }

      await updateProjectNotes(projectPath, args.content);
      return {
        content: [{
          type: "text" as const,
          text: `Appended to ${args.name}/notes.md`,
        }],
      };
    }
  );

  const createProjectTool = tool(
    "create_project",
    "Create a new project with initial structure",
    {
      name: z.string().describe("Project name (kebab-case)"),
      description: z.string().describe("Brief project description"),
    },
    async (args) => {
      const projectPath = join(getProjectsPath(), args.name);
      if (projectExists(projectPath)) {
        return {
          content: [{
            type: "text" as const,
            text: `Project "${args.name}" already exists.`,
          }],
        };
      }

      createProjectDir(projectPath, args.name);

      // Update notes with description
      writeProjectNotes(projectPath, `# ${args.name}\n\n${args.description}\n\n## Notes\n\n`);

      return {
        content: [{
          type: "text" as const,
          text: `Created project "${args.name}" at ${projectPath}`,
        }],
      };
    }
  );

  return createSdkMcpServer({
    name: "projects",
    version: "1.0.0",
    tools: [listProjectsTool, getProjectTool, appendNotesTool, createProjectTool],
  });
}

export const PROJECT_TOOL_NAMES = [
  "mcp__projects__list_projects",
  "mcp__projects__get_project",
  "mcp__projects__append_project_notes",
  "mcp__projects__create_project",
];
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/tools/projects.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/tools/projects.ts tests/tools/projects.test.ts
git commit -m "feat: add project MCP tools"
```

---

### Task 15: Integrate Project Tools into Perch

**Files:**
- Modify: `src/perch.ts`

**Step 1: Update perch.ts to include project tools**

Add imports:
```typescript
import { createProjectToolsServer, PROJECT_TOOL_NAMES } from "./tools/projects";
```

Add to MCP servers in `executeWork`:
```typescript
const projectsServer = createProjectToolsServer();

// In mcpServers object:
mcpServers: {
  memory: memoryServer,
  calendar: calendarServer,
  github: githubServer,
  skills: skillsServer,
  beads: BEADS_SERVER,
  projects: projectsServer,  // Add this
},
allowedTools: [
  ...BLOCK_TOOL_NAMES,
  ...CALENDAR_TOOL_NAMES,
  ...GITHUB_TOOL_NAMES,
  ...SKILL_TOOL_NAMES,
  ...BEADS_TOOL_NAMES,
  ...PROJECT_TOOL_NAMES,  // Add this
],
```

**Step 2: Commit**

```bash
git add src/perch.ts
git commit -m "feat: integrate project tools into perch"
```

---

### Task 16: Create async-review Skill

**Files:**
- Create: `state/skills/async-review.md`

**Step 1: Create the skill file**

```markdown
# Async Review

Skill for autonomous project review with Discord notification.

## When to Use

- Scheduled periodic review (e.g., daily)
- After completing significant work
- When progress warrants owner notification

## Process

1. **Select project**: Pick highest priority focused project
2. **Gather state**: Read notes, goals, recent log entries
3. **Synthesize progress**: What changed since last async review?
4. **Generate summary**: Concise Discord-friendly format
5. **Send notification**: Post to Discord
6. **Log review**: Record in project's log.md

## Discord Format

Keep under 2000 characters. Use markdown formatting.

```
**Project Update: [name]**

📊 **Progress**
- [What was accomplished]
- [Status changes]

🎯 **Current Goals**
1. [Top goal] - [status]
2. [Next goal] - [status]

💡 **Suggested Updates**
- [Any proposed changes]

React 👍 to confirm goals are accurate, or reply with changes.
```

## Reaction Handling

Future enhancement: Monitor for reactions and replies
- 👍 = Goals confirmed, continue
- 💬 Reply = Process feedback, update goals

## Frequency

- Don't send more than once per day per project
- Skip if no meaningful progress since last review
- Always send if goals were completed
```

**Step 2: Commit**

```bash
git add state/skills/async-review.md
git commit -m "feat: add async-review skill for Discord notifications"
```

---

### Task 17: Remove PR #3 Auto-Generation Code

**Files:**
- Delete: `src/perch/focus-review.ts` (if merged from PR #3)
- Delete: `src/perch/beads-helper.ts` (if merged from PR #3)
- Modify: `src/perch/work.ts` (remove focus-review imports if present)

**Step 1: Clean up any PR #3 artifacts**

If PR #3 was merged, remove:
- `src/perch/focus-review.ts`
- `src/perch/beads-helper.ts`
- Any imports/references to these in `work.ts`

**Step 2: Commit**

```bash
git rm src/perch/focus-review.ts src/perch/beads-helper.ts 2>/dev/null || true
git add -u
git commit -m "chore: remove auto-generation code from PR #3"
```

---

### Task 18: Update Documentation

**Files:**
- Create: `docs/projects.md`

**Step 1: Create documentation**

```markdown
# Projects and Focus

Bud uses a project-based system for organizing work.

## Concepts

### Projects

A project is a directory containing notes, goals, and context:

```
~/.bud/projects/
  my-project/
    notes.md     # Freeform notes and context
    goals.md     # Structured goals
    links.md     # Links to repos, resources
    log.md       # Activity log
```

### Focus

Focus is which projects Bud works on autonomously. Maximum 3 projects.

View focus: Ask Bud "what am I focused on?"
Add to focus: "Focus on [project]"
Remove: "Remove [project] from focus"

### Goals

Goals live in each project's `goals.md`:

```markdown
## Active

### Ship feature X
- Priority: 1
- Deadline: 2026-01-15
- Links: beads:BID-5

## Completed

### Fix bug Y
- Completed: 2026-01-01
```

## Skills

- `select-work` - Autonomous work selection
- `select-coding-work` - Select from beads tasks
- `select-research` - Select research work
- `project-review` - Review and update goals
- `project-status` - Quick status summary
- `create-project` - Create new project
- `update-focus` - Manage focus
- `synthesize-to-project` - Save conversation insights
- `async-review` - Discord progress updates

## Workflow

1. Create project: `/create-project my-project`
2. Add to focus: "Focus on my-project"
3. Discuss goals with Bud
4. Bud works autonomously during perch ticks
5. Review progress: `/project-review my-project`
6. Save insights: `/synthesize-to-project my-project`
```

**Step 2: Commit**

```bash
git add docs/projects.md
git commit -m "docs: add projects and focus documentation"
```

---

## Final Task: Integration Test

### Task 19: End-to-End Test

**Files:**
- Create: `tests/integration/projects-e2e.test.ts`

**Step 1: Write integration test**

```typescript
// tests/integration/projects-e2e.test.ts
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { initDatabase, closeDatabase } from "../../src/memory/blocks";
import { initJournal } from "../../src/memory/journal";
import { createProject } from "../../src/projects/files";
import { addProjectToFocus, getFocusedProjects } from "../../src/projects/focus";
import { selectWork } from "../../src/perch/work";

const TEST_DIR = join(import.meta.dir, ".test-e2e");
const TEST_DB = join(TEST_DIR, "test.db");
const TEST_JOURNAL = join(TEST_DIR, "journal.jsonl");
const TEST_PROJECTS = join(TEST_DIR, "projects");

beforeEach(() => {
  mkdirSync(TEST_PROJECTS, { recursive: true });
  initDatabase(TEST_DB);
  initJournal(TEST_JOURNAL);

  // Set budget
  const { setBlock } = require("../../src/memory/blocks");
  setBlock("budget_daily_cap", "10.00", 4);
  setBlock("budget_daily_spent", "0.00", 4);
});

afterEach(() => {
  closeDatabase();
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("projects e2e", () => {
  test("full workflow: create project, add to focus, select work", async () => {
    // Create project
    const projectPath = join(TEST_PROJECTS, "test-project");
    createProject(projectPath, "Test Project");
    expect(existsSync(projectPath)).toBe(true);

    // Add to focus
    addProjectToFocus({
      name: "test-project",
      path: projectPath,
      priority: 1,
    });

    // Verify focus
    const focused = getFocusedProjects();
    expect(focused).toHaveLength(1);
    expect(focused[0].name).toBe("test-project");

    // Select work should return project-based work
    const work = await selectWork([]);
    expect(work).not.toBeNull();
    expect(work!.type).toBe("goal");
    expect(work!.id).toContain("test-project");
  });
});
```

**Step 2: Run test**

Run: `bun test tests/integration/projects-e2e.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add tests/integration/projects-e2e.test.ts
git commit -m "test: add projects e2e integration test"
```

---

## Summary

This plan implements:

| Phase | Tasks | What It Adds |
|-------|-------|--------------|
| 1 | Tasks 1-7 | Project structure, types, files, focus manager, core skills |
| 2 | Tasks 8-11 | Project management skills |
| 3 | Tasks 12-13 | Synthesis skills |
| 4 | Tasks 14-19 | Tools, integration, cleanup, docs |

**Total: 19 tasks**

Each task follows TDD with:
- Failing test first
- Minimal implementation
- Verify passing
- Commit

After completion, Bud will have:
- File-based projects with notes/goals
- Focus system pointing to active projects
- Skill-based work selection
- Tools for project management
- Skills for review, synthesis, async updates
