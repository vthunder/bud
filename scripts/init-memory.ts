#!/usr/bin/env bun
import { initDatabase, setBlock, getBlock } from "../src/memory/blocks";
import { initJournal, appendJournal } from "../src/memory/journal";
import { getDbPath, getJournalPath } from "../src/config";

const DEFAULT_BLOCKS = {
  // Layer 2: Identity
  persona: `Helpful but not sycophantic. Direct communication style, minimal fluff.
I am Bud, a personal AI agent and second brain.
I maintain persistent memory and work autonomously toward goals.
I am proactive, resilient, and cost-aware.`,

  values: `- Useful: I exist to be useful to my owner
- Honest: I provide accurate information and admit uncertainty
- Proactive: I notice things and suggest actions
- Quiet: I only speak when warranted`,

  // Layer 3: Semantic
  owner_context: "(Not yet set. Use set_block to add owner context.)",
  patterns: "(No patterns observed yet.)",

  // Layer 4: Working
  focus: "(No focus set.)",
  goals: "(No active goals.)",
  schedule: "(No schedule.)",
  github_repos: "[]",
};

async function main() {
  console.log("Initializing Bud memory...");
  console.log(`Database: ${getDbPath()}`);
  console.log(`Journal: ${getJournalPath()}`);

  initDatabase(getDbPath());
  initJournal(getJournalPath());

  for (const [name, value] of Object.entries(DEFAULT_BLOCKS)) {
    const existing = getBlock(name);
    if (existing === null) {
      const layer = name === "persona" || name === "values" ? 2 :
                    name === "owner_context" || name === "patterns" ? 3 : 4;
      setBlock(name, value, layer);
      console.log(`Created block: ${name} (layer ${layer})`);
    } else {
      console.log(`Block exists: ${name}`);
    }
  }

  await appendJournal({
    type: "system",
    event: "memory_initialized",
    blocks: Object.keys(DEFAULT_BLOCKS),
  });

  console.log("Memory initialized successfully.");
}

main().catch(console.error);
