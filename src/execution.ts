import { getState, setState, shouldYield } from "./state";
import { trackCost, trackTokens, formatBudgetStatus } from "./budget";
import { appendJournal } from "./memory/working";
import { ClaudeSession, getDefaultSession } from "./claude-session";
import { getSessionManager } from "./session-manager";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

export interface ExecutionResult {
  response: string;
  toolsUsed: string[];
  totalCost: number;
  sessionId: string;
  yielded: boolean;
  yieldReason: string | null;
}

export interface ExecutionOptions {
  prompt: string;
  sessionBudget: number;
  workingDir?: string;
  resumeSessionId?: string; // If provided, resume this Claude CLI session
}

// Path to MCP config for Claude CLI
const MCP_CONFIG_PATH = "/tmp/bud-claude/mcp-config.json";

/**
 * Create MCP config file for Claude CLI
 */
async function ensureMcpConfig(): Promise<void> {
  const configDir = path.dirname(MCP_CONFIG_PATH);
  if (!existsSync(configDir)) {
    await mkdir(configDir, { recursive: true });
  }

  const config = {
    mcpServers: {
      "bud-tools": {
        command: "bun",
        args: ["run", path.join(process.cwd(), "src/mcp-server.ts")],
        env: {
          // Pass through required env vars
          STATE_PATH: process.env.STATE_PATH || "/app/state",
          DISCORD_TOKEN: process.env.DISCORD_TOKEN || "",
          DISCORD_CHANNEL_ID: process.env.DISCORD_CHANNEL_ID || "",
          GITHUB_TOKEN: process.env.GITHUB_TOKEN || "",
          GOOGLE_SERVICE_ACCOUNT_JSON:
            process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "",
          GOOGLE_CALENDAR_IDS: process.env.GOOGLE_CALENDAR_IDS || "",
        },
      },
      // External MCP servers
      ...(process.env.BEADS_PATH && {
        beads: {
          command: "beads-mcp",
          env: {
            BEADS_PATH: process.env.BEADS_PATH,
            BEADS_USE_DAEMON: "0",
          },
        },
      }),
      ...(process.env.NOTION_API_KEY && {
        notion: {
          command: "notion-mcp-server",
          env: {
            NOTION_TOKEN: process.env.NOTION_API_KEY,
          },
        },
      }),
    },
  };

  await writeFile(MCP_CONFIG_PATH, JSON.stringify(config, null, 2));
}

export async function executeWithYield(
  options: ExecutionOptions
): Promise<ExecutionResult> {
  const { prompt, sessionBudget, workingDir, resumeSessionId } = options;
  const startTime = Date.now();

  // Initialize session tracking
  setState({
    session_budget: sessionBudget,
    session_spent: 0,
  });

  // Log session state
  const sm = getSessionManager();
  const stats = sm.getStats();
  const sessionMode = resumeSessionId ? "continue" : "fresh";
  console.log(
    `[execution] Starting ${sessionMode} session: ` +
      `prompt ${(prompt.length / 1024).toFixed(1)}KB, ` +
      `budget $${sessionBudget.toFixed(2)}, ` +
      `context ${stats.totalTokens.toLocaleString()}/${stats.threshold.toLocaleString()} tokens ` +
      `(${(stats.utilization * 100).toFixed(1)}%)`
  );

  try {
    // Ensure MCP config exists
    await ensureMcpConfig();

    // Get Claude session
    const session = getDefaultSession({
      workingDir: workingDir || process.cwd(),
      outputDir: "/tmp/bud-claude",
    });

    // Check for preemption before starting
    if (shouldYield()) {
      const state = getState();
      appendJournal({
        type: "yield",
        reason: state.preempt_reason || "Preempted before start",
        budget_status: formatBudgetStatus(),
        tools_used: [],
      });

      return {
        response: "I was interrupted before I could start. Please try again.",
        toolsUsed: [],
        totalCost: 0,
        sessionId: "",
        yielded: true,
        yieldReason: state.preempt_reason || "Preempted",
      };
    }

    // Send message to Claude (with optional session resumption)
    const result = await session.sendMessage(prompt, {
      timeoutMs: 300000, // 5 minutes
      mcpConfigPath: MCP_CONFIG_PATH,
      resumeSessionId,
    });

    const totalTime = Date.now() - startTime;
    console.log(
      `[execution] Complete in ${totalTime}ms, ${result.toolsUsed.length} tools`
    );

    // Handle errors
    if (result.error) {
      appendJournal({
        type: "execution_error",
        error: result.error,
        response_preview: result.response.slice(0, 200),
      });

      // Reset session on error (will start fresh next time)
      if (resumeSessionId) {
        console.log("[execution] Session error, will start fresh next time");
        sm.reset();
      }

      if (result.error === "timeout") {
        return {
          response:
            "I'm sorry, but the request timed out. Please try again with a simpler request.",
          toolsUsed: result.toolsUsed,
          totalCost: 0,
          sessionId: "",
          yielded: true,
          yieldReason: "timeout",
        };
      }
    }

    // Track actual cost from Claude CLI JSON output
    const actualCost = result.totalCost;
    trackCost(actualCost);
    setState({ session_spent: actualCost });

    // Track token usage
    if (result.usage) {
      trackTokens(result.usage.inputTokens, result.usage.outputTokens);
      console.log(
        `[execution] Tokens: ${result.usage.inputTokens} in, ${result.usage.outputTokens} out` +
          (result.usage.cacheReadTokens > 0
            ? `, ${result.usage.cacheReadTokens} cache read`
            : "")
      );

      // Update session manager with token counts
      if (result.sessionId) {
        sm.updateAfterMessage({
          sessionId: result.sessionId,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          costUsd: actualCost,
        });
      }
    }

    return {
      response: result.response,
      toolsUsed: result.toolsUsed,
      totalCost: actualCost,
      sessionId: result.sessionId,
      yielded: false,
      yieldReason: null,
    };
  } catch (error) {
    console.error("[execution] Error:", error);

    // Reset session on error
    if (resumeSessionId) {
      console.log("[execution] Session error, resetting for fresh start");
      sm.reset();
    }

    appendJournal({
      type: "execution_error",
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
