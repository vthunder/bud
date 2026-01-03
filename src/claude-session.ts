/**
 * Claude Code Session Manager
 *
 * Runs Claude Code CLI instances in tmux for visibility and debugging.
 * Uses print mode for reliable message handling.
 */

import { spawn } from "child_process";
import { promisify } from "util";
import { exec } from "child_process";
import { mkdir, writeFile, readFile, unlink } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

const execAsync = promisify(exec);

export interface ClaudeSessionConfig {
  sessionName: string;
  workingDir: string;
  outputDir: string;
  claudePath?: string;
}

export interface SessionResponse {
  response: string;
  toolsUsed: string[];
  totalCost: number;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
  };
  error?: string;
}

interface ClaudeJsonResponse {
  type: string;
  subtype: string;
  result: string;
  is_error: boolean;
  total_cost_usd: number;
  num_turns: number;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
  };
}

/**
 * Manages Claude Code instances running in tmux
 */
export class ClaudeSession {
  private sessionName: string;
  private workingDir: string;
  private outputDir: string;
  private claudePath: string;
  private requestCounter: number = 0;

  constructor(config: ClaudeSessionConfig) {
    this.sessionName = config.sessionName;
    this.workingDir = config.workingDir;
    this.outputDir = config.outputDir;
    this.claudePath = config.claudePath || "/usr/bin/claude";
  }

  /**
   * Ensure output directory exists
   */
  async init(): Promise<void> {
    if (!existsSync(this.outputDir)) {
      await mkdir(this.outputDir, { recursive: true });
    }
  }

  /**
   * Check if the main tmux session exists
   */
  async sessionExists(): Promise<boolean> {
    try {
      await execAsync(`tmux has-session -t ${this.sessionName} 2>/dev/null`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create the main tmux session if it doesn't exist
   */
  async ensureSession(): Promise<void> {
    await this.init();

    if (await this.sessionExists()) {
      return;
    }

    console.log(`[claude-session] Creating tmux session: ${this.sessionName}`);
    await execAsync(
      `tmux new-session -d -s ${this.sessionName} -c "${this.workingDir}" "echo 'Bud Claude Session Ready'; exec bash"`
    );
  }

  /**
   * Send a message to Claude and get the response
   * Creates a new tmux window for each request, visible for debugging
   */
  async sendMessage(
    prompt: string,
    options: {
      timeoutMs?: number;
      allowedTools?: string[];
      mcpConfigPath?: string;
    } = {}
  ): Promise<SessionResponse> {
    const { timeoutMs = 300000 } = options;
    await this.ensureSession();

    const requestId = ++this.requestCounter;
    const windowName = `req-${requestId}`;
    const outputFile = path.join(this.outputDir, `${windowName}.out`);
    const promptFile = path.join(this.outputDir, `${windowName}.prompt`);
    const doneFile = path.join(this.outputDir, `${windowName}.done`);

    // Write prompt to file (handles special characters better)
    await writeFile(promptFile, prompt);

    // Build claude command - use JSON output for cost tracking
    const claudeArgs = [
      "--print",
      "--dangerously-skip-permissions",
      "--output-format",
      "json",
    ];

    // Add MCP config if provided
    if (options.mcpConfigPath) {
      claudeArgs.push("--mcp-config", options.mcpConfigPath);
    }

    // Explicitly pass ANTHROPIC_API_KEY to avoid relying on shell env inheritance
    const apiKey = process.env.ANTHROPIC_API_KEY || "";
    const envPrefix = apiKey ? `ANTHROPIC_API_KEY="${apiKey}" ` : "";

    // The command: read prompt from file, run claude, save output, mark done
    const cmd = `cat "${promptFile}" | ${envPrefix}${this.claudePath} ${claudeArgs.join(" ")} > "${outputFile}" 2>&1; echo $? > "${doneFile}"`;

    console.log(`[claude-session] Starting request ${requestId}`);

    // Create new window in tmux for this request
    try {
      await execAsync(
        `tmux new-window -t ${this.sessionName} -n ${windowName} -c "${this.workingDir}" '${cmd}'`
      );
    } catch (e) {
      // If session doesn't exist, recreate it
      await this.ensureSession();
      await execAsync(
        `tmux new-window -t ${this.sessionName} -n ${windowName} -c "${this.workingDir}" '${cmd}'`
      );
    }

    // Wait for completion
    const response = await this.waitForCompletion(
      outputFile,
      doneFile,
      timeoutMs
    );

    // Cleanup files (but keep for debugging if error)
    if (!response.error) {
      await this.cleanupFiles([promptFile, outputFile, doneFile]);
    }

    // Close the tmux window after completion
    try {
      await execAsync(`tmux kill-window -t ${this.sessionName}:${windowName}`);
    } catch {
      // Window may have already closed
    }

    console.log(
      `[claude-session] Request ${requestId} complete: ${response.response.length} chars`
    );
    return response;
  }

  /**
   * Wait for the done file to appear, then read the output
   */
  private async waitForCompletion(
    outputFile: string,
    doneFile: string,
    timeoutMs: number
  ): Promise<SessionResponse> {
    const startTime = Date.now();
    const pollInterval = 1000; // 1 second

    while (Date.now() - startTime < timeoutMs) {
      await this.sleep(pollInterval);

      // Check if done file exists
      if (existsSync(doneFile)) {
        try {
          const exitCode = parseInt(await readFile(doneFile, "utf-8"), 10);
          const rawOutput = existsSync(outputFile)
            ? await readFile(outputFile, "utf-8")
            : "";

          // Parse JSON response from Claude CLI
          const parsed = this.parseClaudeOutput(rawOutput, exitCode);
          return parsed;
        } catch (e) {
          console.error("[claude-session] Error reading output:", e);
        }
      }

      // Log progress periodically
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      if (elapsed > 0 && elapsed % 30 === 0) {
        console.log(`[claude-session] Still waiting... ${elapsed}s elapsed`);
      }
    }

    return {
      response: "Request timed out",
      toolsUsed: [],
      totalCost: 0,
      error: "timeout",
    };
  }

  /**
   * Parse Claude CLI JSON output
   */
  private parseClaudeOutput(
    rawOutput: string,
    exitCode: number
  ): SessionResponse {
    // Try to parse as JSON
    try {
      const json = JSON.parse(rawOutput.trim()) as ClaudeJsonResponse;

      const usage = json.usage
        ? {
            inputTokens: json.usage.input_tokens || 0,
            outputTokens: json.usage.output_tokens || 0,
            cacheCreationTokens: json.usage.cache_creation_input_tokens || 0,
            cacheReadTokens: json.usage.cache_read_input_tokens || 0,
          }
        : undefined;

      // Log cost info
      if (json.total_cost_usd > 0) {
        console.log(
          `[claude-session] Cost: $${json.total_cost_usd.toFixed(4)}, ` +
            `tokens: ${usage?.inputTokens || 0} in / ${usage?.outputTokens || 0} out, ` +
            `turns: ${json.num_turns}`
        );
      }

      if (json.is_error || json.subtype !== "success") {
        return {
          response: json.result || rawOutput,
          toolsUsed: [],
          totalCost: json.total_cost_usd || 0,
          usage,
          error: json.subtype || "unknown_error",
        };
      }

      return {
        response: json.result || "",
        toolsUsed: [], // Tool info not in JSON output, could parse from result text
        totalCost: json.total_cost_usd || 0,
        usage,
      };
    } catch {
      // Fallback for non-JSON output (shouldn't happen with --output-format json)
      console.warn("[claude-session] Failed to parse JSON, using raw output");

      if (exitCode !== 0) {
        return {
          response: rawOutput || `Claude exited with code ${exitCode}`,
          toolsUsed: [],
          totalCost: 0,
          error: `exit_code_${exitCode}`,
        };
      }

      return {
        response: rawOutput.trim(),
        toolsUsed: [],
        totalCost: 0,
      };
    }
  }

  /**
   * Extract tool names from Claude's output (best effort)
   */
  private extractToolsFromOutput(output: string): string[] {
    const tools: Set<string> = new Set();

    // Look for common tool patterns in output
    const toolPatterns = [
      /Using tool: (\w+)/g,
      /Tool: (\w+)/g,
      /\[(\w+)\] tool/gi,
    ];

    for (const pattern of toolPatterns) {
      let match;
      while ((match = pattern.exec(output)) !== null) {
        tools.add(match[1]);
      }
    }

    return Array.from(tools);
  }

  /**
   * Clean up temporary files
   */
  private async cleanupFiles(files: string[]): Promise<void> {
    for (const file of files) {
      try {
        await unlink(file);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Kill all windows and the session
   */
  async destroy(): Promise<void> {
    if (await this.sessionExists()) {
      console.log(`[claude-session] Destroying session ${this.sessionName}`);
      await execAsync(`tmux kill-session -t ${this.sessionName}`);
    }
  }

  /**
   * Kill a specific request window
   */
  async killRequest(requestId: number): Promise<void> {
    try {
      await execAsync(
        `tmux kill-window -t ${this.sessionName}:req-${requestId}`
      );
    } catch {
      // Window may not exist
    }
  }

  /**
   * List active request windows
   */
  async listActiveRequests(): Promise<string[]> {
    try {
      const { stdout } = await execAsync(
        `tmux list-windows -t ${this.sessionName} -F "#{window_name}" 2>/dev/null`
      );
      return stdout
        .trim()
        .split("\n")
        .filter((w) => w.startsWith("req-"));
    } catch {
      return [];
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Singleton session manager
let defaultSession: ClaudeSession | null = null;

export function getDefaultSession(
  config?: Partial<ClaudeSessionConfig>
): ClaudeSession {
  if (!defaultSession) {
    defaultSession = new ClaudeSession({
      sessionName: config?.sessionName || "bud-claude",
      workingDir: config?.workingDir || process.cwd(),
      outputDir: config?.outputDir || "/tmp/bud-claude",
      claudePath: config?.claudePath || "/usr/bin/claude",
    });
  }
  return defaultSession;
}

export async function destroyDefaultSession(): Promise<void> {
  if (defaultSession) {
    await defaultSession.destroy();
    defaultSession = null;
  }
}
