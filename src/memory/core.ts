/**
 * Core Memory (Layer 1)
 *
 * Static identity and configuration loaded from .md files.
 * Read-only at runtime - edited by humans directly.
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { config } from "../config";

export interface CoreMemory {
  persona: string;
  values: string;
  owner_context: string;
  system_guide: string;
  communication: string;
}

function getCoreDir(): string {
  return join(config.state.path, "1_core");
}

function readMdFile(filename: string): string {
  const path = join(getCoreDir(), filename);
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf-8");
}

export function loadCoreMemory(): CoreMemory {
  return {
    persona: readMdFile("persona.md"),
    values: readMdFile("values.md"),
    owner_context: readMdFile("owner_context.md"),
    system_guide: readMdFile("system_guide.md"),
    communication: readMdFile("communication.md"),
  };
}

/**
 * Format core memory for inclusion in prompts
 */
export function formatCoreForPrompt(core: CoreMemory): string {
  const sections: string[] = [];

  if (core.persona) {
    sections.push(`## Identity\n\n${core.persona}`);
  }

  if (core.values) {
    sections.push(`## Values\n\n${core.values}`);
  }

  if (core.owner_context) {
    sections.push(`## About Your Owner\n\n${core.owner_context}`);
  }

  if (core.system_guide) {
    sections.push(`## System Guide\n\n${core.system_guide}`);
  }

  if (core.communication) {
    sections.push(`## Communication Style\n\n${core.communication}`);
  }

  return sections.join("\n\n");
}
