# Image Generation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable Bud to generate AI images (via Replicate) and diagrams (via Mermaid.ink) and share them in Discord.

**Architecture:** Two MCP tools - `generate_image` calls Replicate API and uploads result to Discord, `generate_diagram` returns Mermaid.ink URL for auto-embedding. Discord client passed through agent context.

**Tech Stack:** Replicate SDK, Mermaid.ink API, discord.js attachments

---

## Task 1: Add Replicate Dependency and Config

**Files:**
- Modify: `package.json`
- Modify: `src/config.ts`

**Step 1: Add replicate dependency**

Run: `bun add replicate`

**Step 2: Add config for Replicate**

Add to `src/config.ts` in the config object:

```typescript
replicate: {
  apiToken: process.env.REPLICATE_API_TOKEN ?? "",
},
```

**Step 3: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add package.json bun.lock src/config.ts
git commit -m "feat: add replicate dependency and config"
```

---

## Task 2: Create Mermaid Integration

**Files:**
- Create: `src/integrations/mermaid.ts`
- Create: `tests/integrations/mermaid.test.ts`

**Step 1: Write the test**

Create `tests/integrations/mermaid.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import { generateMermaidUrl } from "../../src/integrations/mermaid";

describe("generateMermaidUrl", () => {
  test("generates valid mermaid.ink URL", () => {
    const code = "graph TD\n  A --> B";
    const url = generateMermaidUrl(code);
    expect(url).toStartWith("https://mermaid.ink/img/");
  });

  test("base64 encodes the diagram code", () => {
    const code = "graph TD\n  A --> B";
    const url = generateMermaidUrl(code);
    // URL should contain base64 encoded content
    const base64Part = url.replace("https://mermaid.ink/img/", "");
    const decoded = atob(base64Part);
    expect(decoded).toBe(code);
  });

  test("handles special characters", () => {
    const code = 'graph TD\n  A["Hello World"] --> B';
    const url = generateMermaidUrl(code);
    expect(url).toStartWith("https://mermaid.ink/img/");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/integrations/mermaid.test.ts`
Expected: FAIL - module not found

**Step 3: Implement**

Create `src/integrations/mermaid.ts`:

```typescript
export function generateMermaidUrl(code: string): string {
  const base64 = btoa(code);
  return `https://mermaid.ink/img/${base64}`;
}
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/integrations/mermaid.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/integrations/mermaid.ts tests/integrations/mermaid.test.ts
git commit -m "feat: add mermaid.ink integration"
```

---

## Task 3: Create Replicate Integration

**Files:**
- Create: `src/integrations/replicate.ts`
- Create: `tests/integrations/replicate.test.ts`

**Step 1: Write the test**

Create `tests/integrations/replicate.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import { getDefaultModel, CURATED_MODELS } from "../../src/integrations/replicate";

describe("replicate integration", () => {
  test("has curated models defined", () => {
    expect(CURATED_MODELS.schnell).toBe("black-forest-labs/flux-schnell");
    expect(CURATED_MODELS.pro).toBe("black-forest-labs/flux-1.1-pro");
    expect(CURATED_MODELS.sdxl).toBe("stability-ai/sdxl");
  });

  test("getDefaultModel returns schnell", () => {
    expect(getDefaultModel()).toBe("black-forest-labs/flux-schnell");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/integrations/replicate.test.ts`
Expected: FAIL - module not found

**Step 3: Implement**

Create `src/integrations/replicate.ts`:

```typescript
import Replicate from "replicate";
import { config } from "../config";

export const CURATED_MODELS = {
  schnell: "black-forest-labs/flux-schnell",
  pro: "black-forest-labs/flux-1.1-pro",
  sdxl: "stability-ai/sdxl",
} as const;

export function getDefaultModel(): string {
  return CURATED_MODELS.schnell;
}

export function createReplicateClient(): Replicate | null {
  if (!config.replicate.apiToken) return null;
  return new Replicate({ auth: config.replicate.apiToken });
}

export interface GenerateImageOptions {
  prompt: string;
  model?: string;
  aspectRatio?: string;
}

export async function generateImage(options: GenerateImageOptions): Promise<string | null> {
  const client = createReplicateClient();
  if (!client) return null;

  const model = options.model || getDefaultModel();

  try {
    const output = await client.run(model as `${string}/${string}`, {
      input: {
        prompt: options.prompt,
        aspect_ratio: options.aspectRatio || "1:1",
      },
    });

    // Replicate returns different formats depending on model
    // Most image models return an array of URLs or a single URL
    if (Array.isArray(output) && output.length > 0) {
      return output[0] as string;
    }
    if (typeof output === "string") {
      return output;
    }
    return null;
  } catch (error) {
    console.error("[replicate] Error generating image:", error);
    return null;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/integrations/replicate.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/integrations/replicate.ts tests/integrations/replicate.test.ts
git commit -m "feat: add replicate integration"
```

---

## Task 4: Create Image Tools Server

**Files:**
- Create: `src/tools/images.ts`

**Step 1: Create the image tools server**

Create `src/tools/images.ts`:

```typescript
import { z } from "zod";
import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import type { Client, TextChannel } from "discord.js";
import { generateImage, getDefaultModel, CURATED_MODELS } from "../integrations/replicate";
import { generateMermaidUrl } from "../integrations/mermaid";
import { config } from "../config";

export function createImageToolsServer(discordClient: Client, channelId: string) {
  const generateImageTool = tool(
    "generate_image",
    `Generate an AI image and upload to Discord. Default model: ${getDefaultModel()}. Available presets: schnell (fast), pro (quality), sdxl. Or specify any Replicate model ID.`,
    {
      prompt: z.string().describe("What to generate"),
      model: z.string().optional().describe("Model: 'schnell', 'pro', 'sdxl', or full Replicate model ID"),
      aspect_ratio: z.string().optional().describe("Aspect ratio: '1:1', '16:9', '9:16', etc."),
    },
    async (args) => {
      if (!config.replicate.apiToken) {
        return { content: [{ type: "text" as const, text: "Image generation not configured (no REPLICATE_API_TOKEN)" }] };
      }

      try {
        // Resolve model shorthand to full ID
        let model = args.model;
        if (model && model in CURATED_MODELS) {
          model = CURATED_MODELS[model as keyof typeof CURATED_MODELS];
        }

        const imageUrl = await generateImage({
          prompt: args.prompt,
          model,
          aspectRatio: args.aspect_ratio,
        });

        if (!imageUrl) {
          return { content: [{ type: "text" as const, text: "Failed to generate image" }] };
        }

        // Download and upload to Discord
        const response = await fetch(imageUrl);
        if (!response.ok) {
          return { content: [{ type: "text" as const, text: "Failed to download generated image" }] };
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        const channel = await discordClient.channels.fetch(channelId) as TextChannel;

        if (!channel || !("send" in channel)) {
          return { content: [{ type: "text" as const, text: "Could not find Discord channel" }] };
        }

        await channel.send({
          files: [{ attachment: buffer, name: "generated-image.png" }],
        });

        return { content: [{ type: "text" as const, text: `Generated image for: "${args.prompt}"` }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error generating image: ${error}` }] };
      }
    }
  );

  const generateDiagramTool = tool(
    "generate_diagram",
    "Generate a Mermaid diagram. Returns a URL that Discord will auto-embed as an image.",
    {
      code: z.string().describe("Mermaid diagram code (e.g., 'graph TD\\n  A --> B')"),
    },
    async (args) => {
      try {
        const url = generateMermaidUrl(args.code);
        return { content: [{ type: "text" as const, text: url }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error generating diagram: ${error}` }] };
      }
    }
  );

  return createSdkMcpServer({
    name: "images",
    version: "1.0.0",
    tools: [generateImageTool, generateDiagramTool],
  });
}

export const IMAGE_TOOL_NAMES = [
  "mcp__images__generate_image",
  "mcp__images__generate_diagram",
];
```

**Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/tools/images.ts
git commit -m "feat: add image generation MCP tools"
```

---

## Task 5: Update Agent Context for Discord Client

**Files:**
- Modify: `src/agent.ts`
- Modify: `src/bot.ts`

**Step 1: Update AgentContext interface**

In `src/agent.ts`, update the AgentContext interface:

```typescript
import type { Client } from "discord.js";

export interface AgentContext {
  userId: string;
  username: string;
  channelId: string;
  discordClient: Client;
}
```

**Step 2: Update bot.ts to pass Discord client**

In `src/bot.ts`, update the invokeAgent call (around line 34):

```typescript
const result = await invokeAgent(message.content, {
  userId: message.author.id,
  username: message.author.username,
  channelId: message.channelId,
  discordClient: client,
});
```

**Step 3: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add src/agent.ts src/bot.ts
git commit -m "feat: add Discord client to agent context"
```

---

## Task 6: Wire Image Tools into Agent

**Files:**
- Modify: `src/agent.ts`

**Step 1: Add imports**

Add to imports:

```typescript
import { createImageToolsServer, IMAGE_TOOL_NAMES } from "./tools/images";
```

**Step 2: Create image tools server**

In `invokeAgent`, after creating other servers, add:

```typescript
// Create image tools server
const imageServer = createImageToolsServer(context.discordClient, context.channelId);
```

**Step 3: Add to mcpServers and allowedTools**

Update the query options:

```typescript
mcpServers: {
  "letta-memory": memoryServer,
  "calendar": calendarServer,
  "github": githubServer,
  "images": imageServer,
},
allowedTools: [...MEMORY_TOOL_NAMES, ...CALENDAR_TOOL_NAMES, ...GITHUB_TOOL_NAMES, ...IMAGE_TOOL_NAMES],
```

**Step 4: Add image tools to system prompt**

Add after the GitHub Tools section:

```typescript
## Image Tools
You can generate and share images:
- generate_image: Create AI images (default: Flux Schnell, or specify model)
- generate_diagram: Create Mermaid diagrams (flowcharts, sequence diagrams, etc.)

For diagrams, use Mermaid syntax. The URL will auto-embed in Discord.
```

**Step 5: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

**Step 6: Commit**

```bash
git add src/agent.ts
git commit -m "feat: wire image tools into agent"
```

---

## Task 7: Deploy and Test

**Step 1: Push to GitHub**

```bash
git push origin main
```

**Step 2: Deploy to Dokku**

```bash
git push dokku main
```

**Step 3: Set Replicate API token**

```bash
ssh dokku@sandmill.org config:set bud REPLICATE_API_TOKEN=r8_your_token_here
```

**Step 4: Test diagram generation**

Ask Bud: "Create a simple flowchart showing: Start -> Process -> End"

Expected: Bud returns a Mermaid.ink URL that Discord embeds as an image.

**Step 5: Test image generation**

Ask Bud: "Generate an image of a friendly robot assistant"

Expected: Bud generates an image via Replicate and uploads it to Discord.

---

## Deployment Notes

- Replicate API token required for image generation
- Diagram generation works without any API keys
- Images are uploaded directly to Discord (not just linked)
- Diagrams use stable Mermaid.ink URLs (auto-embedded by Discord)
