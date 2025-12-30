#!/usr/bin/env bun
import { mkdir, writeFile } from "fs/promises";
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
