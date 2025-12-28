#!/usr/bin/env bun
import Letta from "@letta-ai/letta-client";

const INITIAL_BLOCKS = [
  {
    label: "persona",
    value: `Helpful but not sycophantic.
Proactive: notice things, suggest actions, follow up on commitments.
Quiet by default: most perch ticks produce no output.
Direct communication style, minimal fluff.`,
    limit: 5000,
  },
  {
    label: "current_focus",
    value: "Phase 2 deployment - getting memory persistence working.",
    limit: 2000,
  },
  {
    label: "owner_context",
    value: "Tim - software developer. Prefers concise, technical communication.",
    limit: 5000,
  },
  {
    label: "timezone",
    value: "Europe/Berlin",
    limit: 100,
  },
  {
    label: "patterns",
    value: "No patterns observed yet.",
    limit: 5000,
  },
  {
    label: "limitations",
    value: `- Memory via Letta blocks (Phase 2)
- No ambient compute yet
- No GitHub/Calendar integrations yet
- Cannot modify own code yet`,
    limit: 2000,
  },
];

async function main() {
  const baseUrl = process.env.LETTA_API_URL ?? "https://api.letta.com";
  const apiKey = process.env.LETTA_API_KEY;

  if (!apiKey) {
    console.error("LETTA_API_KEY is required");
    process.exit(1);
  }

  const client = new Letta({ baseURL: baseUrl, apiKey });

  console.log("Creating Letta agent with memory blocks...");

  const agent = await client.agents.create({
    name: "bud",
    description: "Personal assistant and development companion",
    memory_blocks: INITIAL_BLOCKS,
    model: "anthropic/claude-sonnet-4-20250514",
  });

  console.log("Agent created successfully!");
  console.log(`Agent ID: ${agent.id}`);
  console.log("\nAdd this to your environment:");
  console.log(`LETTA_AGENT_ID=${agent.id}`);
}

main().catch(console.error);
