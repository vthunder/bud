#!/usr/bin/env bun
import { config, validateConfig } from "./config";
import {
  loadPromptContext,
  buildFullPrompt,
  buildContinuationPrompt,
} from "./prompt";
import {
  appendJournal,
  getFocus,
  getJournalEntriesSince,
} from "./memory/working";
import { gatherPerchContext } from "./perch/context";
import { selectWork, type WorkItem } from "./perch/work";
import { startTyping, stopTyping } from "./discord/sender";
import { appendLog } from "./memory/logs";
import { markTaskComplete } from "./tools/tasks";
import { getState, setState } from "./state";
import {
  checkDailyReset,
  getRemainingBudget,
  formatBudgetStatus,
} from "./budget";
import { executeWithYield } from "./execution";
import { getSessionManager } from "./session-manager";

async function executeWork(work: WorkItem): Promise<void> {
  console.log(
    `[perch] Executing: ${work.description} (budget: $${work.estimatedBudget.toFixed(2)})`
  );

  // Start typing indicator
  await startTyping(config.discord.token, config.discord.channelId);

  setState({
    status: "working",
    current_task: work.description,
    started_at: new Date().toISOString(),
    session_budget: work.estimatedBudget,
    session_spent: 0,
  });

  appendJournal({
    type: "work_started",
    work_type: work.type,
    description: work.description,
    budget: work.estimatedBudget,
  });

  // Get session manager
  const sm = getSessionManager();
  const resumeSessionId = sm.getSessionId();
  const sessionState = sm.getState();

  // Build work-specific prompt content
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
3. Update relevant memory with your progress
4. Report what you accomplished

Begin working on the task now.`;

  const trigger = {
    type: "perch",
    content: workPrompt,
  };

  // Build prompt based on session state
  let prompt: string;
  if (resumeSessionId && sessionState?.lastUsedAt) {
    // Continuation: lighter prompt with just focus + recent activity
    console.log(`[perch] Continuing session ${resumeSessionId.slice(0, 8)}...`);
    const recentJournal = getJournalEntriesSince(sessionState.lastUsedAt);
    prompt = buildContinuationPrompt({ focus: getFocus(), recentJournal }, trigger);
  } else {
    // Fresh: full prompt with core, working, skills
    console.log("[perch] Starting fresh session");
    const promptContext = loadPromptContext();
    prompt = buildFullPrompt(promptContext, trigger);
  }

  try {
    const result = await executeWithYield({
      prompt,
      sessionBudget: work.estimatedBudget,
      resumeSessionId: resumeSessionId ?? undefined,
    });

    // Log completion
    appendJournal({
      type: "work_completed",
      work_type: work.type,
      description: work.description,
      cost: result.totalCost,
      yielded: result.yielded,
      yield_reason: result.yieldReason,
    });

    // The agent uses the send_message tool to communicate with Discord
    // We don't auto-send responses here - the tool handles all messaging
    console.log(
      `[perch] Work completed: ${result.toolsUsed.length} tools used`
    );
  } catch (error) {
    console.error("[perch] Work execution error:", error);
    appendJournal({
      type: "work_error",
      work_type: work.type,
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    // Stop typing indicator
    await stopTyping();
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
