#!/usr/bin/env bun
import Letta from "@letta-ai/letta-client";

const baseUrl = process.env.LETTA_API_URL;
const apiKey = process.env.LETTA_API_KEY;
const agentId = process.env.LETTA_AGENT_ID;

if (!baseUrl || !apiKey || !agentId) {
  console.error("Missing required env vars: LETTA_API_URL, LETTA_API_KEY, LETTA_AGENT_ID");
  process.exit(1);
}

console.log("Connecting to:", baseUrl);
console.log("Agent ID:", agentId);

const client = new Letta({ baseURL: baseUrl, apiKey });

try {
  // First check if block already exists
  const blocks = await client.agents.blocks.list(agentId);
  const existing = blocks.find((b: any) => b.label === "scheduled_tasks");

  if (existing) {
    console.log("Block 'scheduled_tasks' already exists:", existing.id);
    process.exit(0);
  }

  // Create the block
  const result = await client.agents.blocks.create(agentId, {
    label: "scheduled_tasks",
    value: "[]",
    limit: 10000,
  });
  console.log("Created block:", JSON.stringify(result, null, 2));
} catch (e: any) {
  console.error("Error:", e.message);
  process.exit(1);
}
