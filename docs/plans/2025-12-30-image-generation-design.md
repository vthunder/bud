# Image Generation Design

## Overview

Enable Bud to generate and share images via Discord - both AI-generated images (via Replicate) and diagrams (via Mermaid.ink).

## Key Design Decisions

- **Replicate** for AI images - flexible model selection, pay-per-use
- **Mermaid.ink** for diagrams - zero infrastructure, stable URLs
- **Upload** generated images to Discord (Replicate URLs expire)
- **Link** diagrams (Mermaid.ink URLs are stable, Discord auto-embeds)
- **MCP tools** pattern (consistent with existing integrations)
- **Discord client injection** - tools receive Discord context for direct uploads

## Architecture

```
User asks for image/diagram
        ↓
Bud invokes MCP tool
        ↓
┌─────────────────────────────────────┐
│  generate_image     generate_diagram │
│  (Replicate API)    (Mermaid.ink)    │
└─────────────────────────────────────┘
        ↓                    ↓
   Download image      Get stable URL
   Upload to Discord   Embed in message
```

## MCP Tools

### `generate_image`

Generate an AI image and upload to Discord.

**Parameters:**
- `prompt` (string, required) - What to generate
- `model` (string, optional) - Replicate model ID, defaults to Flux Schnell
- `aspect_ratio` (string, optional) - "1:1", "16:9", "9:16", etc.

**Curated default models:**
- `black-forest-labs/flux-schnell` - Fast, cheap, good quality (default)
- `black-forest-labs/flux-1.1-pro` - Higher quality, slower
- `stability-ai/sdxl` - Classic stable diffusion

Any Replicate model can be specified by full ID.

**Flow:**
1. Call Replicate API with prompt and model
2. Poll for completion
3. Download image from temporary URL
4. Upload to Discord as attachment
5. Return success message

### `generate_diagram`

Generate a Mermaid diagram and return embeddable URL.

**Parameters:**
- `code` (string, required) - Mermaid diagram code
- `type` (string, optional) - "flowchart", "sequence", "class", etc.

**Flow:**
1. Base64 encode the Mermaid code
2. Construct URL: `https://mermaid.ink/img/{base64}`
3. Return URL (Discord auto-embeds)

## New Files

| File | Purpose |
|------|---------|
| `src/integrations/replicate.ts` | Replicate API wrapper |
| `src/integrations/mermaid.ts` | Mermaid.ink URL encoder |
| `src/tools/images.ts` | MCP tools server |

## Configuration

**Environment variable:**
- `REPLICATE_API_TOKEN` - Required for AI image generation

**Config addition:**
```typescript
replicate: {
  apiToken: process.env.REPLICATE_API_TOKEN ?? "",
},
```

## Discord Integration

The image tools server receives Discord client and channel ID at creation:

```typescript
createImageToolsServer(discordClient: Client, channelId: string)
```

This allows the `generate_image` tool to upload directly to the conversation channel.

## Error Handling

- Replicate timeout/failure → Return error message, don't crash
- Invalid Mermaid syntax → Mermaid.ink returns error image
- Missing API token → Tool returns "Image generation not configured"
- Upload failure → Return error with details

## Implementation Tasks

1. Add `replicate` npm dependency
2. Add replicate config
3. Create Replicate integration (`src/integrations/replicate.ts`)
4. Create Mermaid integration (`src/integrations/mermaid.ts`)
5. Create image tools server (`src/tools/images.ts`)
6. Wire into agent with Discord context
7. Test end-to-end
