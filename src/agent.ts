import type { Client } from "discord.js";
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
import { executeWithYield } from "./execution";
import { setState, clearPreempt } from "./state";
import { getRemainingBudget, checkDailyReset } from "./budget";
import { getSessionManager } from "./session-manager";

export interface AgentContext {
  userId: string;
  username: string;
  channelId: string;
  discordClient: Client;
}

export interface AgentResult {
  response: string;
  toolsUsed: string[];
  yielded?: boolean;
}

export async function invokeAgent(
  userMessage: string,
  context: AgentContext,
  sessionBudget?: number
): Promise<AgentResult> {
  try {
    checkDailyReset("Europe/Berlin");
    clearPreempt();
    setState({
      status: "working",
      current_task: `Discord: ${userMessage.slice(0, 50)}`,
      started_at: new Date().toISOString(),
    });

    // Log trigger to journal
    appendJournal({
      type: "trigger",
      trigger_type: "message",
      from: context.username,
      content: userMessage,
    });

    // Get session manager
    const sm = getSessionManager();
    const resumeSessionId = sm.getSessionId();
    const sessionState = sm.getState();

    // Build prompt based on session state
    let prompt: string;
    const trigger = {
      type: "message",
      content: userMessage,
      from: context.username,
    };

    if (resumeSessionId && sessionState?.lastUsedAt) {
      // Continuation: lighter prompt with just focus + recent activity
      console.log(`[agent] Continuing session ${resumeSessionId.slice(0, 8)}...`);
      const recentJournal = getJournalEntriesSince(sessionState.lastUsedAt);
      prompt = buildContinuationPrompt({ focus: getFocus(), recentJournal }, trigger);
    } else {
      // Fresh: full prompt with core, working, skills
      console.log("[agent] Starting fresh session");
      const promptContext = loadPromptContext();
      prompt = buildFullPrompt(promptContext, trigger);
    }

    // Use session budget or remaining daily budget (max $1.00 per message)
    const budget = sessionBudget ?? Math.min(getRemainingBudget(), 1.0);

    const result = await executeWithYield({
      prompt,
      sessionBudget: budget,
      resumeSessionId: resumeSessionId ?? undefined,
    });

    // Log execution complete (messages are logged by send_message tool)
    appendJournal({
      type: "execution_complete",
      trigger_from: context.username,
      tools_used: result.toolsUsed,
      cost: result.totalCost,
      yielded: result.yielded,
    });

    setState({ status: "idle", current_task: null });

    return {
      response: result.response,
      toolsUsed: result.toolsUsed,
      yielded: result.yielded,
    };
  } catch (error) {
    console.error("[agent] Error:", error);
    // Log error to journal
    appendJournal({
      type: "error",
      error: error instanceof Error ? error.message : String(error),
      context: "invokeAgent",
    });
    setState({ status: "idle", current_task: null });
    return {
      response:
        "I encountered an error processing your request. Please try again.",
      toolsUsed: [],
    };
  }
}
