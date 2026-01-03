import { getState, setState, shouldYield, isWrappingUp } from "./state";
import { trackCost, formatBudgetStatus } from "./budget";
import { appendJournal } from "./memory/journal";
import { ClaudeSession, getDefaultSession } from "./claude-session";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

export interface ExecutionResult {
  response: string;
  toolsUsed: string[];
  totalCost: number;
  yielded: boolean;
  yieldReason: string | null;
}

export interface ExecutionOptions {
  prompt: string;
  sessionBudget: number;
  workingDir?: string;
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
          GITHUB_TOKEN: process.env.GITHUB_TOKEN || "",
          GOOGLE_SERVICE_ACCOUNT_JSON: process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "",
          GOOGLE_CALENDAR_IDS: process.env.GOOGLE_CALENDAR_IDS || "",
          SKILLS_PATH: process.env.SKILLS_PATH || "/app/state/skills",
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
  const { prompt, sessionBudget, workingDir } = options;
  const startTime = Date.now();

  // Initialize session tracking
  setState({
    session_budget: sessionBudget,
    session_spent: 0,
  });

  console.log(
    `[execution] Starting query: prompt ${(prompt.length / 1024).toFixed(1)}KB, budget $${sessionBudget.toFixed(2)}`
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
      await appendJournal({
        type: "yield",
        reason: state.preempt_reason || "Preempted before start",
        budget_status: formatBudgetStatus(),
        tools_used: [],
      });

      return {
        response: "I was interrupted before I could start. Please try again.",
        toolsUsed: [],
        totalCost: 0,
        yielded: true,
        yieldReason: state.preempt_reason || "Preempted",
      };
    }

    // Send message to Claude
    const result = await session.sendMessage(prompt, {
      timeoutMs: 300000, // 5 minutes
      mcpConfigPath: MCP_CONFIG_PATH,
    });

    const totalTime = Date.now() - startTime;
    console.log(
      `[execution] Complete in ${totalTime}ms, ${result.toolsUsed.length} tools`
    );

    // Handle errors
    if (result.error) {
      await appendJournal({
        type: "execution_error",
        error: result.error,
        response_preview: result.response.slice(0, 200),
      });

      if (result.error === "timeout") {
        return {
          response:
            "I'm sorry, but the request timed out. Please try again with a simpler request.",
          toolsUsed: result.toolsUsed,
          totalCost: 0,
          yielded: true,
          yieldReason: "timeout",
        };
      }
    }

    // Track cost (estimated since CLI doesn't provide exact cost)
    // Estimate based on prompt size and response size
    const estimatedCost = estimateTokenCost(prompt, result.response);
    trackCost(estimatedCost);
    setState({ session_spent: estimatedCost });

    return {
      response: result.response,
      toolsUsed: result.toolsUsed,
      totalCost: estimatedCost,
      yielded: false,
      yieldReason: null,
    };
  } catch (error) {
    console.error("[execution] Error:", error);
    await appendJournal({
      type: "execution_error",
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Estimate token cost based on text length
 * Very rough estimate - actual cost depends on model and tokenization
 */
function estimateTokenCost(prompt: string, response: string): number {
  // Rough estimate: 4 chars per token
  const promptTokens = prompt.length / 4;
  const responseTokens = response.length / 4;

  // Claude Sonnet pricing (approximate)
  const inputCostPer1K = 0.003;
  const outputCostPer1K = 0.015;

  const cost =
    (promptTokens / 1000) * inputCostPer1K +
    (responseTokens / 1000) * outputCostPer1K;

  return Math.max(0.001, cost); // Minimum $0.001
}
