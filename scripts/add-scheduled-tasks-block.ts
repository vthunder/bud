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
  // Just try to create the block directly
  const result = await client.agents.blocks.create(agentId, {
    label: "scheduled_tasks",
    value: "[]",
    limit: 10000,
  });
  console.log("Created block:", JSON.stringify(result, null, 2));
} catch (e: any) {
  if (e.message?.includes("already exists") || e.message?.includes("duplicate")) {
    console.log("Block 'scheduled_tasks' already exists");
    process.exit(0);
  }
  console.error("Error:", e.message);
  console.error("Full error:", JSON.stringify(e, null, 2));
  process.exit(1);
}
