import type { Client } from "discord.js";
import { config, getDbPath, getJournalPath } from "./config";
import { initDatabase, getBlocksByLayer } from "./memory/blocks";
import { initJournal, appendJournal, getRecentJournal } from "./memory/journal";
import { buildFullPrompt, type PromptContext } from "./prompt";
import { listSkillNames } from "./skills";
import { executeWithYield } from "./execution";
import { setState, clearPreempt } from "./state";
import { getRemainingBudget, checkDailyReset } from "./budget";

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

let initialized = false;

function ensureInitialized(): void {
  if (!initialized) {
    initDatabase(getDbPath());
    initJournal(getJournalPath());
    initialized = true;
  }
}

async function loadPromptContext(): Promise<PromptContext> {
  const identity = getBlocksByLayer(2);
  const semantic = getBlocksByLayer(3);
  const working = getBlocksByLayer(4);
  const journal = await getRecentJournal(40);
  const skills = await listSkillNames(config.skills.path);
  return { identity, semantic, working, journal, skills };
}

export async function invokeAgent(
  userMessage: string,
  context: AgentContext,
  sessionBudget?: number
): Promise<AgentResult> {
  try {
    ensureInitialized();
    checkDailyReset("Europe/Berlin");
    clearPreempt();
    setState({
      status: "working",
      current_task: `Discord: ${userMessage.slice(0, 50)}`,
      started_at: new Date().toISOString(),
    });

    // Log trigger to journal
    await appendJournal({
      type: "trigger",
      trigger_type: "message",
      from: context.username,
      content: userMessage,
    });

    // Load prompt context from local memory
    const promptContext = await loadPromptContext();

    const prompt = buildFullPrompt(promptContext, {
      type: "message",
      content: userMessage,
      from: context.username,
    });

    // Use session budget or remaining daily budget (max $1.00 per message)
    const budget = sessionBudget ?? Math.min(getRemainingBudget(), 1.0);

    const result = await executeWithYield({
      prompt,
      sessionBudget: budget,
    });

    // Log response sent
    await appendJournal({
      type: "message_sent",
      to: context.username,
      content: result.response,
      tools_used: result.toolsUsed,
      cost: result.totalCost,
      yielded: result.yielded,
    });

    setState({ status: "idle", current_task: null });

    return {
      response:
        result.response || "I apologize, but I couldn't generate a response.",
      toolsUsed: result.toolsUsed,
      yielded: result.yielded,
    };
  } catch (error) {
    console.error("[agent] Error:", error);
    // Log error to journal
    await appendJournal({
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
