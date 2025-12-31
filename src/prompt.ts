import { formatJournalForPrompt, type JournalEntry } from "./memory/journal";

export interface PromptContext {
  identity: Record<string, string>;   // Layer 2: persona, values, style
  semantic: Record<string, string>;   // Layer 3: owner_context, patterns
  working: Record<string, string>;    // Layer 4: focus, goals, schedule
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

## Memory Tools

You have tools to persist information:
- **get_block**: Read a memory block
- **set_block**: Update a memory block (creates new version, history preserved)
- **list_blocks**: See all blocks
- **block_history**: View past versions of a block

Update memory when you learn something important. Blocks by layer:
- Layer 2 (identity): persona, values - owner-controlled, you cannot modify
- Layer 3 (semantic): owner_context, patterns - update when you learn new patterns
- Layer 4 (working): focus, goals, schedule - update frequently as context changes

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

export function buildFullPrompt(
  context: PromptContext,
  trigger: { type: string; content: string; from?: string }
): string {
  const systemPrompt = buildSystemPrompt(context);

  let triggerText: string;
  if (trigger.type === "message" && trigger.from) {
    triggerText = `[Message from ${trigger.from}]: ${trigger.content}`;
  } else if (trigger.type === "perch") {
    triggerText = `[Perch tick]: ${trigger.content}`;
  } else if (trigger.type === "cron") {
    triggerText = `[Scheduled job]: ${trigger.content}`;
  } else {
    triggerText = trigger.content;
  }

  return `${systemPrompt}\n\n---\n\n${triggerText}`;
}
