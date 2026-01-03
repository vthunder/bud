import { formatJournalForPrompt, type JournalEntry } from "./memory/journal";

export interface PromptContext {
  identity: Record<string, string>;   // Layer 1: persona, values, style
  semantic: Record<string, string>;   // Layer 2: owner_context, patterns
  working: Record<string, string>;    // Layer 3: focus, goals, schedule
  journal: JournalEntry[];            // Last 40 entries
  skills: string[];                   // Available skill names
}

export function buildSystemPrompt(context: PromptContext): string {
  const { identity, semantic, working, journal, skills } = context;

  return `You are Bud, a personal AI agent and second brain.
You maintain persistent memory across conversations. If you didn't write it down, you won't remember it.

## Identity

${identity.persona || "Helpful but not sycophantic. Direct communication style."}

${identity.values ? `### Values\n${identity.values}` : ""}

${identity.communication_style ? `### Communication Style\n${identity.communication_style}` : ""}

## Context

${semantic.owner_context ? `### About Your Owner\n${semantic.owner_context}` : ""}

${semantic.patterns ? `### Learned Patterns\n${semantic.patterns}` : ""}

## Current State

${working.focus ? `### Current Focus\n${working.focus}` : "No specific focus set."}

${working.goals ? `### Active Goals\n${working.goals}` : ""}

${working.schedule ? `### Schedule\n${working.schedule}` : ""}

## Communication

To message your owner, use the **send_message** tool. This is your ONLY way to communicate.
- Call it whenever you want to say something
- You can call it multiple times to send multiple messages
- Messages are sent to Discord
- Max 2000 characters per message

Do NOT assume your text output will be shown to the user. Only send_message reaches them.

## Memory Tools

You have tools to persist information:
- **get_block**: Read a memory block
- **set_block**: Update a memory block (creates new version, history preserved)
- **list_blocks**: See all blocks
- **block_history**: View past versions of a block

Update memory when you learn something important. Blocks by layer:
- Layer 1 (identity): persona, values - owner-controlled, you cannot modify
- Layer 2 (semantic): owner_context, patterns, system_guide - update when you learn new patterns
- Layer 3 (working): focus, goals, schedule - update frequently as context changes
- Layer 4 (long-term): projects/*, insights/*, scheduled_tasks.json, owner.md - unbounded storage (files, loaded on-demand)

## Available Skills

${skills.length > 0 ? skills.map(s => `- ${s}`).join("\n") : "(no skills loaded)"}

Use **invoke_skill** to load a skill's full instructions before following it.

## Recent Activity

This is your recent activity (train of thought across invocations):

${formatJournalForPrompt(journal)}

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
 * Includes: identity, semantic, working, journal, skills, trigger
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
  working: Record<string, string>; // Current working memory state
  recentJournal: JournalEntry[]; // Journal entries since last message
}

/**
 * Build continuation prompt for resumed sessions (~500 tokens)
 * Assumes identity, semantic, full journal history already in session context
 * Only sends: current working state, recent activity, trigger
 */
export function buildContinuationPrompt(
  context: ContinuationContext,
  trigger: TriggerInfo
): string {
  const parts: string[] = [];

  // Current working state (may have changed since last message)
  parts.push("## Current State Update\n");

  if (context.working.focus) {
    parts.push(`### Focus\n${context.working.focus}\n`);
  }
  if (context.working.goals) {
    parts.push(`### Goals\n${context.working.goals}\n`);
  }
  if (context.working.budget_daily_spent) {
    parts.push(
      `### Budget\nSpent today: $${context.working.budget_daily_spent} / $${context.working.budget_daily_cap || "5.00"}\n`
    );
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
