# Bud Phase 6: Self-Improvement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable Bud to modify its own code via a skill-based workflow with PR review.

**Architecture:** Skills are markdown files in `/app/state/.claude/skills/`. Agent loads skills into system prompt. Self-improve skill guides Bud through git clone, edit, test, PR workflow.

**Tech Stack:** TypeScript, Claude Agent SDK, gh CLI, git

---

## Task 1: Create Skills Loading Function

**Files:**
- Create: `src/skills.ts`
- Test: `tests/skills.test.ts`

**Step 1: Write the test**

Create `tests/skills.test.ts`:

```typescript
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
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/skills.test.ts`
Expected: FAIL - module not found

**Step 3: Implement loadSkills**

Create `src/skills.ts`:

```typescript
import { readdir, readFile } from "fs/promises";
import { join } from "path";

export async function loadSkills(skillsDir: string): Promise<string> {
  try {
    const files = await readdir(skillsDir);
    const mdFiles = files.filter((f) => f.endsWith(".md")).sort();

    if (mdFiles.length === 0) return "";

    const skills: string[] = [];
    for (const file of mdFiles) {
      const content = await readFile(join(skillsDir, file), "utf-8");
      skills.push(content.trim());
    }

    return skills.join("\n\n---\n\n");
  } catch {
    return "";
  }
}
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/skills.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/skills.ts tests/skills.test.ts
git commit -m "feat: add skills loading function"
```

---

## Task 2: Create Self-Improve Skill Script

**Files:**
- Create: `scripts/setup-self-improve-skill.ts`

**Step 1: Create the setup script**

Create `scripts/setup-self-improve-skill.ts`:

```typescript
#!/usr/bin/env bun
import { mkdir, writeFile, access } from "fs/promises";
import { join } from "path";

const SKILLS_DIR = process.env.SKILLS_DIR || "/app/state/.claude/skills";
const DEV_DIR = process.env.DEV_DIR || "/app/state/bud-dev";

const SELF_IMPROVE_SKILL = `# Self-Improvement Skill

Use this skill when you identify a bug, improvement, or receive a request to modify your own code.

## When to Use

- You notice an error in your logs that could be fixed
- You see inefficient code during normal operation
- Owner explicitly asks you to fix or improve something
- You want to add a capability to yourself

## Allowed Paths

You may freely modify:
- \`src/**\` - Source code
- \`tests/**\` - Test files

## Blocked Paths (Require Approval)

Ask owner before modifying:
- \`Dockerfile\`, \`Procfile\` - Deployment config
- \`package.json\`, \`tsconfig.json\` - Project config
- \`.env*\`, \`*.pem\`, \`*.key\` - Secrets
- \`scripts/\` - Deployment scripts
- \`.claude/skills/self-improve.md\` - This file

If you need to modify a blocked path, ask: "This fix requires modifying [file] to [reason]. Reply 'approved' to proceed."

## Workflow

### 1. Setup Workspace

\`\`\`bash
# Create dev directory if needed
mkdir -p ${DEV_DIR}

# Clone or update repo
if [ -d "${DEV_DIR}/.git" ]; then
  cd ${DEV_DIR}
  git fetch origin
  git checkout dev 2>/dev/null || git checkout -b dev
  git reset --hard origin/main
else
  git clone https://github.com/vthunder/bud.git ${DEV_DIR}
  cd ${DEV_DIR}
  git checkout -b dev
fi
\`\`\`

### 2. Investigate

- Read the relevant code files
- Understand the issue
- Identify which files need changes
- Verify all files are in allowed paths

### 3. Implement

- If fixing a bug, write a failing test first
- Make minimal, focused changes
- Keep the fix simple

### 4. Verify

\`\`\`bash
cd ${DEV_DIR}
bun run typecheck
bun test
\`\`\`

If tests fail:
- Fix the issue
- Retry (max 3 attempts)
- If still failing, abort and report the problem

### 5. Submit PR

\`\`\`bash
cd ${DEV_DIR}
git add -A
git commit -m "fix: [descriptive message]"
git push -u origin dev --force
gh pr create --title "[title]" --body "[description]" --base main || gh pr edit --title "[title]" --body "[description]"
\`\`\`

### 6. Notify Owner

Post in Discord:
"Created PR: [title]
[brief description of what was fixed]
[PR link]"

## Abort Conditions

Stop and report if:
- Typecheck/tests fail after 3 attempts
- Blocked path needs modification without approval
- Git conflicts that can't be resolved
- PR already open from previous work

## Remember

- Never push directly to main
- Always run typecheck and tests
- Keep changes minimal and focused
- Write tests for bug fixes
- Notify owner when done
`;

async function setup() {
  console.log("Setting up self-improve skill...");

  // Create skills directory
  try {
    await mkdir(SKILLS_DIR, { recursive: true });
    console.log(`Created skills directory: ${SKILLS_DIR}`);
  } catch (e: any) {
    if (e.code !== "EEXIST") throw e;
  }

  // Create dev directory
  try {
    await mkdir(DEV_DIR, { recursive: true });
    console.log(`Created dev directory: ${DEV_DIR}`);
  } catch (e: any) {
    if (e.code !== "EEXIST") throw e;
  }

  // Write skill file
  const skillPath = join(SKILLS_DIR, "self-improve.md");
  await writeFile(skillPath, SELF_IMPROVE_SKILL);
  console.log(`Created skill file: ${skillPath}`);

  console.log("Setup complete!");
}

setup().catch((e) => {
  console.error("Setup failed:", e);
  process.exit(1);
});
```

**Step 2: Make it executable and test locally**

Run: `chmod +x scripts/setup-self-improve-skill.ts`

**Step 3: Commit**

```bash
git add scripts/setup-self-improve-skill.ts
git commit -m "feat: add self-improve skill setup script"
```

---

## Task 3: Integrate Skills into Agent

**Files:**
- Modify: `src/agent.ts`

**Step 1: Add skills import and loading**

Add import at top:

```typescript
import { loadSkills } from "./skills";
```

**Step 2: Add skills to system prompt**

Modify `buildSystemPrompt` to accept skills parameter and include them:

```typescript
function buildSystemPrompt(memory: BudContext, skills: string): string {
  return `You are Bud, a personal assistant and development companion.
You maintain persistent memory across conversations through Letta memory blocks.
If you didn't write it down, you won't remember it next message.

## Your Identity
${memory.persona || "Helpful but not sycophantic. Direct communication style, minimal fluff."}

## Current Focus
${memory.currentFocus || "No specific focus set."}

## About Your Owner
${memory.ownerContext || "No owner context available."}

## Timezone
${memory.timezone || "UTC"}

## Memory Tools
You have access to memory tools to persist information:
- list_memory: See available memory blocks
- get_memory: Read a memory block
- set_memory: Update a memory block (use this to remember things!)

When you learn something important about your owner, your tasks, or yourself,
use set_memory to persist it. Otherwise you will forget it next message.

## Calendar Tools
You have access to Google Calendar:
- calendar_events: List upcoming events (defaults to next 7 days)
- calendar_event_details: Get full details of a specific event
- calendar_create_event: Create a new calendar event
- calendar_availability: Check free/busy times

## GitHub Tools
You have access to GitHub for monitored repos:
- github_prs: List open pull requests
- github_issues: List open issues assigned to you
- github_pr_details: Get details of a specific PR
- github_notifications: Check unread notifications

To manage which repos you monitor, update your github_repos memory block.
Format: ["owner/repo1", "owner/repo2"]

## Self-Improvement
You can modify your own code! You have access to Bash, Read, Write, and Edit tools.
When you identify bugs or improvements, follow your self-improve skill.
All changes go through PR review - never push directly to main.

${skills ? `## Skills\n\n${skills}` : ""}
`;
}
```

**Step 3: Load skills in invokeAgent**

Add before building system prompt:

```typescript
// Load skills
const skills = await loadSkills("/app/state/.claude/skills");
```

Update the buildSystemPrompt call:

```typescript
const systemPrompt = buildSystemPrompt(memory, skills);
```

**Step 4: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

**Step 5: Commit**

```bash
git add src/agent.ts
git commit -m "feat: integrate skills into agent system prompt"
```

---

## Task 4: Add Config for Skills Path

**Files:**
- Modify: `src/config.ts`

**Step 1: Add skills path to config**

Add to the config object:

```typescript
skills: {
  path: process.env.SKILLS_PATH || "/app/state/.claude/skills",
},
```

**Step 2: Update agent.ts to use config**

Change the loadSkills call to use config:

```typescript
const skills = await loadSkills(config.skills.path);
```

Add import if needed:

```typescript
import { config } from "./config";
```

**Step 3: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add src/config.ts src/agent.ts
git commit -m "feat: add skills path config"
```

---

## Task 5: Run Setup on Server

**Step 1: Push changes**

```bash
git push origin main
```

**Step 2: Deploy to Dokku**

Wait for deployment or trigger manually.

**Step 3: Run setup script on server**

```bash
ssh dokku@sandmill.org run bud bun scripts/setup-self-improve-skill.ts
```

**Step 4: Verify skill was created**

```bash
ssh dokku@sandmill.org run bud cat /app/state/.claude/skills/self-improve.md
```

Expected: Skill content is displayed

**Step 5: Test by asking Bud**

Send Bud a message: "What skills do you have?"

Expected: Bud should mention self-improvement capability

---

## Task 6: End-to-End Test

**Step 1: Create a test fix request**

Ask Bud: "There's a typo in your system prompt - it says 'next message' twice. Can you fix it?"

(Note: This is a made-up issue for testing. Bud should try the workflow.)

**Step 2: Observe the workflow**

Watch for:
- Bud clones/updates the dev workspace
- Makes changes
- Runs typecheck and tests
- Creates a PR
- Notifies you

**Step 3: Verify PR was created**

Check GitHub for a new PR from the dev branch.

**Step 4: Clean up**

Close the test PR without merging (if it was just a test).

---

## Deployment Notes

After all tasks complete:

1. The skill file lives in persistent storage at `/app/state/.claude/skills/self-improve.md`
2. Bud loads skills on each invocation
3. The dev workspace is at `/app/state/bud-dev/`
4. All PRs go to the `dev` branch, targeting `main`

To update the skill later, either:
- Re-run the setup script
- Manually edit `/var/lib/dokku/data/storage/bud-state/.claude/skills/self-improve.md`
