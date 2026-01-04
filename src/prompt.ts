import { loadCoreMemory, formatCoreForPrompt, type CoreMemory } from "./memory/core";
import {
  loadWorkingMemory,
  formatJournalForPrompt,
  type JournalEntry,
  type WorkingMemory,
} from "./memory/working";
import { listSkillNames } from "./memory/long_term";

export interface PromptContext {
  core: CoreMemory;
  working: WorkingMemory;
  skills: string[];
}

/**
 * Load all context needed for a fresh prompt
 */
export function loadPromptContext(journalCount: number = 20): PromptContext {
  return {
    core: loadCoreMemory(),
    working: loadWorkingMemory(journalCount),
    skills: listSkillNames(),
  };
}

export function buildSystemPrompt(context: PromptContext): string {
  const { core, working, skills } = context;

  const coreSection = formatCoreForPrompt(core);

  return `You are Bud, a personal AI agent and second brain.
You maintain persistent memory across conversations. If you didn't write it down, you won't remember it.

${coreSection}

## Current State

${working.focus ? `### Current Focus\n${working.focus}` : "No specific focus set."}

${working.inbox ? `### Inbox\n${working.inbox}` : ""}

${working.commitments ? `### Commitments\n${working.commitments}` : ""}

## Communication

To message your owner, use the **send_message** tool. This is your ONLY way to communicate.
- Call it whenever you want to say something
- You can call it multiple times to send multiple messages
- Messages are sent to Discord
- Max 2000 characters per message

Do NOT assume your text output will be shown to the user. Only send_message reaches them.

## Memory Structure

Your memory is organized into three layers:
- **Core (1_core/)**: Identity, values, owner context, system guide - read-only at runtime
- **Working (2_working/)**: Focus, inbox, commitments, journal - changes during operation
- **Long-term (3_long_term/)**: Projects, skills, scheduled tasks - accessed on-demand

Update working memory when context changes. Core memory is edited by your owner.

## Available Skills

${skills.length > 0 ? skills.map((s) => `- ${s}`).join("\n") : "(no skills loaded)"}

Use **invoke_skill** to load a skill's full instructions before following it.

## Recent Activity

This is your recent activity (train of thought across invocations):

${formatJournalForPrompt(working.recentJournal)}

Use this to maintain continuity. You can see what you were working on and why.

## Guidelines

- Be proactive: notice things, suggest actions, follow up
- Be quiet by default: only speak when warranted
- Update memory: persist anything important
- Log decisions: your reasoning helps future you understand past actions
`;
}

export interface TriggerInfo {
  type: string;
  content: string;
  from?: string;
}

function formatTrigger(trigger: TriggerInfo): string {
  if (trigger.type === "message" && trigger.from) {
    return `[Message from ${trigger.from}]: ${trigger.content}`;
  } else if (trigger.type === "perch") {
    return `[Perch tick]: ${trigger.content}`;
  } else if (trigger.type === "cron") {
    return `[Scheduled job]: ${trigger.content}`;
  }
  return trigger.content;
}

/**
 * Build full prompt for fresh sessions (~6K tokens)
 * Includes: core, working, skills, trigger
 */
export function buildFullPrompt(context: PromptContext, trigger: TriggerInfo): string {
  const systemPrompt = buildSystemPrompt(context);
  const triggerText = formatTrigger(trigger);
  return `${systemPrompt}\n\n---\n\n${triggerText}`;
}

/**
 * Context for continuation prompts (lighter weight)
 */
export interface ContinuationContext {
  focus: string;
  recentJournal: JournalEntry[];
}

/**
 * Build continuation prompt for resumed sessions (~500 tokens)
 * Assumes core, full journal history already in session context
 * Only sends: current focus, recent activity, trigger
 */
export function buildContinuationPrompt(
  context: ContinuationContext,
  trigger: TriggerInfo
): string {
  const parts: string[] = [];

  // Current working state (may have changed since last message)
  parts.push("## Current State Update\n");

  if (context.focus) {
    parts.push(`### Focus\n${context.focus}\n`);
  }

  // Recent activity since last message
  if (context.recentJournal.length > 0) {
    parts.push("## Recent Activity\n");
    parts.push(formatJournalForPrompt(context.recentJournal));
  }

  // The trigger
  parts.push("\n---\n");
  parts.push(formatTrigger(trigger));

  return parts.join("\n");
}
