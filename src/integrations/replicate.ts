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
