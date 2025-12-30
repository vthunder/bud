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
