import { query, type McpServerConfig } from "@anthropic-ai/claude-agent-sdk";
import { getState, setState, shouldYield, isWrappingUp } from "./state";
import { trackCost, formatBudgetStatus } from "./budget";
import { appendJournal } from "./memory/journal";

/**
 * Summarize tool input for journal logging.
 * Extracts key details while avoiding sensitive data and keeping size reasonable.
 */
function summarizeToolInput(toolName: string, input: unknown): string | undefined {
  if (!input || typeof input !== "object") return undefined;

  const inp = input as Record<string, unknown>;

  switch (toolName) {
    case "Bash":
      if (typeof inp.command === "string") {
        // Truncate long commands, avoid logging potential secrets
        const cmd = inp.command.slice(0, 200);
        return cmd.length < inp.command.length ? cmd + "..." : cmd;
      }
      break;

    case "Read":
      if (typeof inp.file_path === "string") {
        return inp.file_path;
      }
      break;

    case "Write":
      if (typeof inp.file_path === "string") {
        return inp.file_path;
      }
      break;

    case "Edit":
      if (typeof inp.file_path === "string") {
        return inp.file_path;
      }
      break;

    case "Glob":
      if (typeof inp.pattern === "string") {
        return inp.pattern;
      }
      break;

    case "Grep":
      if (typeof inp.pattern === "string") {
        const path = typeof inp.path === "string" ? ` in ${inp.path}` : "";
        return `/${inp.pattern}/${path}`;
      }
      break;

    case "TodoWrite":
      if (Array.isArray(inp.todos)) {
        return `${inp.todos.length} items`;
      }
      break;

    default:
      // For MCP tools, try to extract a meaningful identifier
      if (toolName.startsWith("mcp__")) {
        // Look for common identifier fields
        for (const key of ["issue_id", "block_name", "name", "id", "query"]) {
          if (typeof inp[key] === "string") {
            return `${key}=${inp[key]}`;
          }
        }
      }
  }

  return undefined;
}

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
  const startTime = Date.now();

  // Initialize session tracking
  setState({
    session_budget: sessionBudget,
    session_spent: 0
  });

  const toolsUsed: string[] = [];
  const toolTimings: { tool: string; elapsed: number }[] = [];
  let responseText = "";
  let totalCost = 0;
  let yielded = false;
  let yieldReason: string | null = null;
  let lastToolTime = startTime;

  console.log(`[execution] Starting query: ${Object.keys(mcpServers).length} MCP servers, ${allowedTools.length} tools, prompt ${(prompt.length / 1024).toFixed(1)}KB`);

  try {
    const queryStartTime = Date.now();
    const result = query({
      prompt,
      options: {
        permissionMode: "bypassPermissions",
        mcpServers,
        allowedTools,
        pathToClaudeCodeExecutable: "/usr/bin/claude",
      },
    });
    console.log(`[execution] Query initiated in ${Date.now() - queryStartTime}ms`);

    for await (const message of result) {
      // Track cost from result messages
      if (message.type === "result" && typeof (message as any).total_cost_usd === "number") {
        const cost = (message as any).total_cost_usd;
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

            const now = Date.now();
            const elapsed = now - lastToolTime;
            toolTimings.push({ tool: block.name, elapsed });

            // Log tool with input for debugging (truncated for Bash)
            if (block.name === "Bash" && block.input && typeof block.input === "object" && "command" in block.input) {
              const cmd = String(block.input.command).slice(0, 100);
              console.log(`[execution] Tool: ${block.name} "${cmd}" (${elapsed}ms since last)`);
            } else {
              console.log(`[execution] Tool: ${block.name} (${elapsed}ms since last)`);
            }
            lastToolTime = now;

            toolsUsed.push(block.name);

            // Log tool use with input summary (async, don't await to reduce latency)
            const inputSummary = summarizeToolInput(block.name, block.input);
            appendJournal({
              type: "tool_use",
              tool: block.name,
              ...(inputSummary && { input: inputSummary }),
            }).catch(e => console.error("[execution] Failed to log tool use:", e));
          }
        }

        if (yielded) break;
      } else if (message.type === "result" && typeof (message as any).result === "string") {
        responseText = (message as any).result;
      }
    }
  } catch (error) {
    await appendJournal({
      type: "execution_error",
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  const totalTime = Date.now() - startTime;
  console.log(`[execution] Complete in ${totalTime}ms, ${toolsUsed.length} tools, $${totalCost.toFixed(4)}`);
  if (toolTimings.length > 0) {
    console.log(`[execution] Tool timings: ${toolTimings.map(t => `${t.tool}(${t.elapsed}ms)`).join(", ")}`);
  }

  return {
    response: responseText,
    toolsUsed,
    totalCost,
    yielded,
    yieldReason,
  };
}
