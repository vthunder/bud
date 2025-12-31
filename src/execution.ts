import { query, type McpServerConfig } from "@anthropic-ai/claude-agent-sdk";
import { getState, setState, shouldYield, isWrappingUp } from "./state";
import { trackCost, formatBudgetStatus } from "./budget";
import { appendJournal } from "./memory/journal";

export interface ExecutionResult {
  response: string;
  toolsUsed: string[];
  totalCost: number;
  yielded: boolean;
  yieldReason: string | null;
}

export interface ExecutionOptions {
  prompt: string;
  mcpServers: Record<string, McpServerConfig>;
  allowedTools: string[];
  sessionBudget: number;
}

export async function executeWithYield(options: ExecutionOptions): Promise<ExecutionResult> {
  const { prompt, mcpServers, allowedTools, sessionBudget } = options;

  // Initialize session tracking
  setState({
    session_budget: sessionBudget,
    session_spent: 0
  });

  const toolsUsed: string[] = [];
  let responseText = "";
  let totalCost = 0;
  let yielded = false;
  let yieldReason: string | null = null;

  try {
    const result = query({
      prompt,
      options: {
        permissionMode: "bypassPermissions",
        mcpServers,
        allowedTools,
        pathToClaudeCodeExecutable: "/usr/bin/claude",
      },
    });

    for await (const message of result) {
      // Track cost from result messages
      if (message.type === "result" && "total_cost_usd" in message) {
        const cost = message.total_cost_usd as number;
        totalCost = cost;
        trackCost(cost);
        setState({ session_spent: cost });
      }

      // Process assistant messages
      if (message.type === "assistant" && "message" in message) {
        for (const block of message.message.content) {
          if (block.type === "text") {
            responseText += block.text;
          } else if (block.type === "tool_use") {
            // Check yield before tool execution
            if (shouldYield()) {
              yielded = true;
              const state = getState();
              yieldReason = state.preempt_requested
                ? state.preempt_reason
                : "Budget limit reached";

              await appendJournal({
                type: "yield",
                reason: yieldReason,
                budget_status: formatBudgetStatus(),
                tools_used: toolsUsed,
              });

              break;
            }

            // Check if wrapping up (past 85% budget)
            if (isWrappingUp()) {
              // Add wrap-up hint to context (agent will see this)
              await appendJournal({
                type: "budget_warning",
                message: "Approaching budget limit, please wrap up",
                budget_status: formatBudgetStatus(),
              });
            }

            toolsUsed.push(block.name);

            // Log tool use
            await appendJournal({
              type: "tool_use",
              tool: block.name,
            });
          }
        }

        if (yielded) break;
      } else if (message.type === "result" && "result" in message) {
        if (message.result) {
          responseText = message.result;
        }
      }
    }
  } catch (error) {
    await appendJournal({
      type: "execution_error",
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  return {
    response: responseText,
    toolsUsed,
    totalCost,
    yielded,
    yieldReason,
  };
}
