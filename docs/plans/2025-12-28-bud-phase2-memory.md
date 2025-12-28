# Bud Phase 2: Memory Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Integrate Letta memory blocks so Bud maintains persistent identity across conversations.

**Architecture:** Use the `@letta-ai/letta-client` SDK to connect to Letta (cloud or self-hosted). Load memory blocks before each agent invocation to provide context. The agent's system prompt references the loaded blocks to guide behavior.

**Tech Stack:** Letta SDK (`@letta-ai/letta-client`), Bun, TypeScript

---

## Task 1: Install Letta SDK and Add Config

**Files:**
- Modify: `package.json`
- Modify: `src/config.ts`

**Step 1: Install Letta SDK**

Run: `bun add @letta-ai/letta-client`

**Step 2: Add Letta config to src/config.ts**

```typescript
export const config = {
  discord: {
    token: process.env.DISCORD_TOKEN ?? "",
    channelId: process.env.DISCORD_CHANNEL_ID ?? "",
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY ?? "",
  },
  letta: {
    baseUrl: process.env.LETTA_API_URL ?? "https://api.letta.com",
    apiKey: process.env.LETTA_API_KEY ?? "",
    agentId: process.env.LETTA_AGENT_ID ?? "",
  },
} as const;

export function validateConfig(): void {
  const required = [
    ["DISCORD_TOKEN", config.discord.token],
    ["DISCORD_CHANNEL_ID", config.discord.channelId],
    ["ANTHROPIC_API_KEY", config.anthropic.apiKey],
    ["LETTA_API_KEY", config.letta.apiKey],
    ["LETTA_AGENT_ID", config.letta.agentId],
  ] as const;

  const missing = required.filter(([, value]) => !value).map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
}
```

**Step 3: Commit**

```bash
git add package.json bun.lock src/config.ts
git commit -m "feat: add Letta SDK and config"
```

---

## Task 2: Create Letta Client Module with Tests (TDD)

**Files:**
- Create: `src/memory/letta.ts`
- Create: `tests/memory/letta.test.ts`

**Step 1: Write failing tests for Letta client**

Create `tests/memory/letta.test.ts`:

```typescript
import { describe, expect, test, mock, beforeEach } from "bun:test";

// Mock the SDK before importing our module
const mockRetrieve = mock(() => Promise.resolve({ value: "test value" }));
const mockUpdate = mock(() => Promise.resolve({ value: "updated" }));

mock.module("@letta-ai/letta-client", () => ({
  default: class MockLetta {
    agents = {
      blocks: {
        retrieve: mockRetrieve,
        update: mockUpdate,
      },
    };
  },
}));

// Import after mocking
const { createLettaClient, getMemoryBlock, setMemoryBlock } = await import(
  "../../src/memory/letta"
);

describe("Letta client", () => {
  beforeEach(() => {
    mockRetrieve.mockClear();
    mockUpdate.mockClear();
  });

  test("createLettaClient returns configured client", () => {
    const client = createLettaClient({
      baseUrl: "http://localhost:8283",
      apiKey: "test-key",
    });
    expect(client).toBeDefined();
    expect(client.agents).toBeDefined();
  });

  test("getMemoryBlock retrieves block by label", async () => {
    mockRetrieve.mockResolvedValueOnce({ value: "persona content" });

    const client = createLettaClient({
      baseUrl: "http://localhost:8283",
      apiKey: "test-key",
    });

    const result = await getMemoryBlock(client, "agent-123", "persona");

    expect(mockRetrieve).toHaveBeenCalledWith("agent-123", "persona");
    expect(result).toBe("persona content");
  });

  test("getMemoryBlock returns empty string if block not found", async () => {
    mockRetrieve.mockRejectedValueOnce(new Error("Not found"));

    const client = createLettaClient({
      baseUrl: "http://localhost:8283",
      apiKey: "test-key",
    });

    const result = await getMemoryBlock(client, "agent-123", "missing");
    expect(result).toBe("");
  });

  test("setMemoryBlock updates block value", async () => {
    mockUpdate.mockResolvedValueOnce({ value: "new content" });

    const client = createLettaClient({
      baseUrl: "http://localhost:8283",
      apiKey: "test-key",
    });

    await setMemoryBlock(client, "agent-123", "persona", "new content");

    expect(mockUpdate).toHaveBeenCalledWith("agent-123", "persona", {
      value: "new content",
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `bun test tests/memory/letta.test.ts`
Expected: FAIL - module not found

**Step 3: Implement Letta client**

Create `src/memory/letta.ts`:

```typescript
import Letta from "@letta-ai/letta-client";

export interface LettaConfig {
  baseUrl?: string;
  apiKey?: string;
}

export function createLettaClient(config: LettaConfig): Letta {
  return new Letta({
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
  });
}

export async function getMemoryBlock(
  client: Letta,
  agentId: string,
  label: string
): Promise<string> {
  try {
    const block = await client.agents.blocks.retrieve(agentId, label);
    return block.value ?? "";
  } catch {
    return "";
  }
}

export async function setMemoryBlock(
  client: Letta,
  agentId: string,
  label: string,
  value: string
): Promise<void> {
  await client.agents.blocks.update(agentId, label, { value });
}
```

**Step 4: Run tests to verify they pass**

Run: `bun test tests/memory/letta.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/memory/letta.ts tests/memory/letta.test.ts
git commit -m "feat: add Letta client with memory block operations"
```

---

## Task 3: Add Context Loader Function

**Files:**
- Modify: `src/memory/letta.ts`
- Modify: `tests/memory/letta.test.ts`

**Step 1: Add test for loadContext function**

Append to `tests/memory/letta.test.ts`:

```typescript
describe("loadContext", () => {
  const { loadContext } = await import("../../src/memory/letta");

  test("loads all memory blocks into context object", async () => {
    mockRetrieve
      .mockResolvedValueOnce({ value: "I am Bud" })
      .mockResolvedValueOnce({ value: "Working on Phase 2" })
      .mockResolvedValueOnce({ value: "Tim, developer" })
      .mockResolvedValueOnce({ value: "Europe/Berlin" });

    const client = createLettaClient({
      baseUrl: "http://localhost:8283",
      apiKey: "test-key",
    });

    const context = await loadContext(client, "agent-123");

    expect(context.persona).toBe("I am Bud");
    expect(context.currentFocus).toBe("Working on Phase 2");
    expect(context.ownerContext).toBe("Tim, developer");
    expect(context.timezone).toBe("Europe/Berlin");
  });

  test("returns empty strings for missing blocks", async () => {
    mockRetrieve.mockRejectedValue(new Error("Not found"));

    const client = createLettaClient({
      baseUrl: "http://localhost:8283",
      apiKey: "test-key",
    });

    const context = await loadContext(client, "agent-123");

    expect(context.persona).toBe("");
    expect(context.currentFocus).toBe("");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/memory/letta.test.ts`
Expected: FAIL - loadContext not found

**Step 3: Implement loadContext**

Add to `src/memory/letta.ts`:

```typescript
export interface BudContext {
  persona: string;
  currentFocus: string;
  ownerContext: string;
  timezone: string;
}

export async function loadContext(
  client: Letta,
  agentId: string
): Promise<BudContext> {
  const [persona, currentFocus, ownerContext, timezone] = await Promise.all([
    getMemoryBlock(client, agentId, "persona"),
    getMemoryBlock(client, agentId, "current_focus"),
    getMemoryBlock(client, agentId, "owner_context"),
    getMemoryBlock(client, agentId, "timezone"),
  ]);

  return { persona, currentFocus, ownerContext, timezone };
}
```

**Step 4: Run tests to verify they pass**

Run: `bun test tests/memory/letta.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/memory/letta.ts tests/memory/letta.test.ts
git commit -m "feat: add loadContext to fetch all memory blocks"
```

---

## Task 4: Integrate Memory into Agent

**Files:**
- Modify: `src/agent.ts`

**Step 1: Update agent to load context from Letta**

Replace `src/agent.ts`:

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";
import { config } from "./config";
import { createLettaClient, loadContext, type BudContext } from "./memory/letta";

export interface AgentContext {
  userId: string;
  username: string;
  channelId: string;
}

export interface AgentResult {
  response: string;
  toolsUsed: string[];
}

function buildSystemPrompt(memory: BudContext): string {
  return `You are Bud, a personal assistant and development companion.
You maintain persistent memory across conversations through Letta blocks and state files.
If you didn't write it down, you won't remember it next message.

## Your Identity
${memory.persona || "Helpful but not sycophantic. Direct communication style, minimal fluff."}

## Current Focus
${memory.currentFocus || "No specific focus set."}

## About Your Owner
${memory.ownerContext || "No owner context available."}

## Timezone
${memory.timezone || "UTC"}

## Current Limitations
- You are in Phase 2: memory persistence is active
- No ambient compute yet (coming soon)
- No GitHub/Calendar integrations yet (coming soon)
`;
}

export async function invokeAgent(
  userMessage: string,
  context: AgentContext
): Promise<AgentResult> {
  try {
    // Load memory from Letta
    const lettaClient = createLettaClient({
      baseUrl: config.letta.baseUrl,
      apiKey: config.letta.apiKey,
    });
    const memory = await loadContext(lettaClient, config.letta.agentId);

    const systemPrompt = buildSystemPrompt(memory);
    const prompt = `${systemPrompt}\n\n---\n\n[Message from ${context.username}]: ${userMessage}`;

    const toolsUsed: string[] = [];
    let responseText = "";

    const result = query({
      prompt,
      options: {
        permissionMode: "bypassPermissions",
        allowedTools: [],
        pathToClaudeCodeExecutable: "/usr/bin/claude",
      },
    });

    for await (const message of result) {
      if (message.type === "assistant" && "message" in message) {
        for (const block of message.message.content) {
          if (block.type === "text") {
            responseText += block.text;
          } else if (block.type === "tool_use") {
            toolsUsed.push(block.name);
          }
        }
      } else if (message.type === "result" && "result" in message) {
        if (message.result) {
          responseText = message.result;
        }
      }
    }

    return {
      response: responseText || "I apologize, but I couldn't generate a response.",
      toolsUsed,
    };
  } catch (error) {
    console.error("[agent] Error:", error);
    return {
      response: "I encountered an error processing your request. Please try again.",
      toolsUsed: [],
    };
  }
}
```

**Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add src/agent.ts
git commit -m "feat: integrate Letta memory into agent context"
```

---

## Task 5: Create Letta Agent Setup Script

**Files:**
- Create: `scripts/setup-letta-agent.ts`

This script creates the Letta agent with initial memory blocks. Run once to set up.

**Step 1: Create setup script**

```typescript
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

  const client = new Letta({ baseUrl, apiKey });

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
```

**Step 2: Make script executable**

Run: `chmod +x scripts/setup-letta-agent.ts`

**Step 3: Commit**

```bash
git add scripts/setup-letta-agent.ts
git commit -m "feat: add Letta agent setup script"
```

---

## Task 6: Update Dockerfile and Deploy

**Files:**
- Modify: `Dockerfile`

**Step 1: Dockerfile already supports additional env vars**

The Dockerfile doesn't need changes - Dokku will inject env vars at runtime.

**Step 2: Set Dokku environment variables**

These commands will be run manually by the operator:

```bash
# If using Letta Cloud:
ssh dokku@sandmill.org config:set bud LETTA_API_URL=https://api.letta.com
ssh dokku@sandmill.org config:set bud LETTA_API_KEY=<your-letta-api-key>

# If self-hosting Letta:
ssh dokku@sandmill.org config:set bud LETTA_API_URL=http://letta:8283

# After running setup script:
ssh dokku@sandmill.org config:set bud LETTA_AGENT_ID=<agent-id-from-setup>
```

**Step 3: Deploy**

```bash
git push dokku main
```

---

## Task 7: Run All Tests and Final Verification

**Step 1: Run full test suite**

Run: `bun test`
Expected: All tests pass

**Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: No errors

**Step 3: Commit any remaining changes**

```bash
git status
# If clean, nothing to commit
```

---

## Post-Implementation: Letta Setup

After deploying, run the setup script to create the Letta agent:

```bash
LETTA_API_KEY=<key> bun run scripts/setup-letta-agent.ts
```

Then set the agent ID in Dokku:

```bash
ssh dokku@sandmill.org config:set bud LETTA_AGENT_ID=<agent-id>
```

---

## Summary

| Task | Description |
|------|-------------|
| 1 | Install Letta SDK and add config |
| 2 | Create Letta client module with tests |
| 3 | Add context loader function |
| 4 | Integrate memory into agent |
| 5 | Create Letta agent setup script |
| 6 | Update Dockerfile and deploy |
| 7 | Run all tests and verify |

**Key files touched:**
- `src/config.ts` - Letta config
- `src/memory/letta.ts` - Letta client module
- `src/agent.ts` - Memory integration
- `tests/memory/letta.test.ts` - Letta tests
- `scripts/setup-letta-agent.ts` - Agent setup

**Environment variables added:**
- `LETTA_API_URL` - Letta API base URL
- `LETTA_API_KEY` - Letta API key
- `LETTA_AGENT_ID` - Letta agent ID for Bud
