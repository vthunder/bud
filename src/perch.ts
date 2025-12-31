#!/usr/bin/env bun
import { config, validateConfig, getDbPath, getJournalPath } from "./config";
import { initDatabase, getBlocksByLayer } from "./memory/blocks";
import { initJournal, appendJournal, getRecentJournal } from "./memory/journal";
import { gatherPerchContext } from "./perch/context";
import { selectWork, type WorkItem } from "./perch/work";
import { sendMessage } from "./discord/sender";
import { appendLog } from "./memory/logs";
import { markTaskComplete } from "./tools/tasks";
import { getState, setState } from "./state";
import { checkDailyReset, getRemainingBudget, formatBudgetStatus } from "./budget";
import { executeWithYield } from "./execution";
import { buildFullPrompt, type PromptContext } from "./prompt";
import { listSkillNames } from "./skills";
import { createBlockToolsServer, BLOCK_TOOL_NAMES } from "./tools/blocks";
import { createCalendarToolsServer, CALENDAR_TOOL_NAMES } from "./tools/calendar";
import { createGitHubToolsServer, GITHUB_TOOL_NAMES } from "./tools/github";
import { createSkillToolsServer, SKILL_TOOL_NAMES } from "./tools/skills";
import { parseReposJson } from "./integrations/github";

async function loadPromptContext(): Promise<PromptContext> {
  const identity = getBlocksByLayer(2);
  const semantic = getBlocksByLayer(3);
  const working = getBlocksByLayer(4);
  const journal = await getRecentJournal(40);
  const skills = await listSkillNames(config.skills.path);
  return { identity, semantic, working, journal, skills };
}

async function executeWork(work: WorkItem): Promise<void> {
  console.log(`[perch] Executing: ${work.description} (budget: $${work.estimatedBudget.toFixed(2)})`);

  setState({
    status: "working",
    current_task: work.description,
    started_at: new Date().toISOString(),
    session_budget: work.estimatedBudget,
    session_spent: 0,
  });

  await appendJournal({
    type: "work_started",
    work_type: work.type,
    description: work.description,
    budget: work.estimatedBudget,
  });

  const promptContext = await loadPromptContext();

  // Build work-specific prompt
  const workPrompt = `You are Bud, doing autonomous work during a perch tick.

## Current Task
${work.description}

## Context
${work.context}

## Budget
You have $${work.estimatedBudget.toFixed(2)} for this task.
${formatBudgetStatus()}

## Instructions
1. Complete the task described above
2. If you're approaching budget limit, wrap up gracefully
3. Update relevant memory blocks with your progress
4. Report what you accomplished

Begin working on the task now.`;

  const fullPrompt = buildFullPrompt(promptContext, {
    type: "perch",
    content: workPrompt,
  });

  // Create MCP servers
  const memoryServer = createBlockToolsServer();
  const calendarServer = createCalendarToolsServer();
  const skillsServer = createSkillToolsServer();
  const reposJson = promptContext.working.github_repos || "[]";
  const githubRepos = parseReposJson(reposJson);
  const githubServer = createGitHubToolsServer(githubRepos);

  try {
    const result = await executeWithYield({
      prompt: fullPrompt,
      mcpServers: {
        memory: memoryServer,
        calendar: calendarServer,
        github: githubServer,
        skills: skillsServer,
      },
      allowedTools: [
        ...BLOCK_TOOL_NAMES,
        ...CALENDAR_TOOL_NAMES,
        ...GITHUB_TOOL_NAMES,
        ...SKILL_TOOL_NAMES,
      ],
      sessionBudget: work.estimatedBudget,
    });

    // Log completion
    await appendJournal({
      type: "work_completed",
      work_type: work.type,
      description: work.description,
      cost: result.totalCost,
      yielded: result.yielded,
      yield_reason: result.yieldReason,
    });

    // Send Discord update if there's something to report
    if (result.response && result.response.length > 0) {
      await sendMessage({
        token: config.discord.token,
        channelId: config.discord.channelId,
        content: result.response.slice(0, 2000), // Discord limit
      });
    }

  } catch (error) {
    console.error("[perch] Work execution error:", error);
    await appendJournal({
      type: "work_error",
      work_type: work.type,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  setState({ status: "idle", current_task: null });
}

async function main() {
  const timestamp = new Date().toISOString();
  console.log(`[perch] Starting tick at ${timestamp}`);

  try {
    validateConfig();
  } catch (error) {
    console.error("[perch] Config validation failed:", error);
    process.exit(1);
  }

  // Initialize
  initDatabase(getDbPath());
  initJournal(getJournalPath());
  checkDailyReset("Europe/Berlin");

  // Check if already working (another process or stuck state)
  const state = getState();
  if (state.status === "working") {
    // Check if it's been too long (>30 min = probably stuck)
    const startedAt = state.started_at ? new Date(state.started_at) : new Date();
    const minutesWorking = (Date.now() - startedAt.getTime()) / (1000 * 60);

    if (minutesWorking > 30) {
      console.log("[perch] Detected stuck state, resetting");
      setState({ status: "idle", current_task: null });
    } else {
      console.log(`[perch] Already working on: ${state.current_task}, skipping`);
      return;
    }
  }

  // Check budget
  const remaining = getRemainingBudget();
  if (remaining <= 0) {
    console.log("[perch] No budget remaining, skipping");
    await appendLog("perch.jsonl", {
      timestamp,
      type: "perch_skip",
      reason: "no_budget",
      budget_status: formatBudgetStatus(),
      content: "SKIP: no budget",
    });
    return;
  }

  // Gather context
  console.log("[perch] Gathering context...");
  const context = await gatherPerchContext();

  // Select work
  const work = await selectWork(context.dueTasks);

  if (!work) {
    console.log("[perch] No work to do");
    await appendLog("perch.jsonl", {
      timestamp,
      type: "perch_idle",
      budget_status: formatBudgetStatus(),
      content: "IDLE: no work",
    });
    return;
  }

  // Execute work
  await executeWork(work);

  // Mark scheduled tasks complete
  if (work.type === "scheduled_task") {
    markTaskComplete(work.id);
  }

  console.log("[perch] Tick complete");
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("[perch] Fatal error:", error);
    process.exit(1);
  });
