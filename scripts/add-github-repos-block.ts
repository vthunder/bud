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
  // Step 1: Create a standalone block
  console.log("Creating block...");
  const block = await client.blocks.create({
    label: "github_repos",
    value: "[]",
    limit: 5000,
  });
  console.log("Created block:", block.id);

  // Step 2: Attach it to the agent
  console.log("Attaching to agent...");
  const result = await client.agents.blocks.attach(block.id, { agent_id: agentId });
  console.log("Attached successfully!");
  console.log("Agent state:", JSON.stringify(result, null, 2));
} catch (e: any) {
  if (e.message?.includes("already exists") || e.message?.includes("duplicate")) {
    console.log("Block 'github_repos' already exists");
    process.exit(0);
  }
  console.error("Error:", e.message);
  console.error("Full error:", JSON.stringify(e, null, 2));
  process.exit(1);
}
