import Letta from "@letta-ai/letta-client";

export interface LettaConfig {
  baseURL?: string;
  apiKey?: string;
}

export function createLettaClient(config: LettaConfig): Letta {
  return new Letta({
    baseURL: config.baseURL,
    apiKey: config.apiKey,
  });
}

export async function getMemoryBlock(
  client: Letta,
  agentId: string,
  label: string
): Promise<string> {
  try {
    const block = await client.agents.blocks.retrieve(label, {
      agent_id: agentId,
    });
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
  await client.agents.blocks.update(label, { agent_id: agentId, value });
}
