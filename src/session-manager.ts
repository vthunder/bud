/**
 * Session Manager for Claude Code sessions
 *
 * Manages session lifecycle to enable prompt reuse:
 * - Fresh sessions get full prompt (~6K tokens)
 * - Continuation sessions get minimal prompt (~500 tokens)
 * - Sessions reset at 90% context capacity to avoid auto-compaction
 */

import { getBlock, setBlock } from "./memory/blocks";

const SESSION_STATE_BLOCK = "claude_session_state";
const SESSION_STATE_LAYER = 3; // Working memory

export interface SessionState {
  sessionId: string | null;
  cumulativeInputTokens: number;
  cumulativeOutputTokens: number;
  totalCostUsd: number;
  createdAt: string;
  lastUsedAt: string;
  messageCount: number;
}

export interface SessionManagerConfig {
  maxContextTokens: number;
  contextThreshold: number; // 0.0 - 1.0
}

const DEFAULT_CONFIG: SessionManagerConfig = {
  maxContextTokens: 200_000, // Opus context window
  contextThreshold: 0.9, // Reset at 90%
};

export class SessionManager {
  private config: SessionManagerConfig;
  private state: SessionState | null = null;

  constructor(config: Partial<SessionManagerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Load session state from persistent storage
   */
  load(): void {
    const raw = getBlock(SESSION_STATE_BLOCK);
    if (raw) {
      try {
        this.state = JSON.parse(raw) as SessionState;
      } catch {
        console.warn("[session-manager] Failed to parse session state, starting fresh");
        this.state = null;
      }
    }
  }

  /**
   * Save session state to persistent storage
   */
  save(): void {
    if (this.state) {
      setBlock(SESSION_STATE_BLOCK, JSON.stringify(this.state), SESSION_STATE_LAYER);
    } else {
      setBlock(SESSION_STATE_BLOCK, "", SESSION_STATE_LAYER);
    }
  }

  /**
   * Check if we should start a fresh session
   */
  shouldStartFresh(): boolean {
    if (!this.state?.sessionId) {
      return true;
    }

    const totalTokens = this.state.cumulativeInputTokens + this.state.cumulativeOutputTokens;
    const threshold = this.config.maxContextTokens * this.config.contextThreshold;

    return totalTokens >= threshold;
  }

  /**
   * Get current session ID (null if should start fresh)
   */
  getSessionId(): string | null {
    return this.shouldStartFresh() ? null : this.state?.sessionId ?? null;
  }

  /**
   * Update state after a message completes
   */
  updateAfterMessage(result: {
    sessionId: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  }): void {
    const now = new Date().toISOString();

    if (!this.state || this.state.sessionId !== result.sessionId) {
      // New session
      this.state = {
        sessionId: result.sessionId,
        cumulativeInputTokens: result.inputTokens,
        cumulativeOutputTokens: result.outputTokens,
        totalCostUsd: result.costUsd,
        createdAt: now,
        lastUsedAt: now,
        messageCount: 1,
      };
      console.log(
        `[session-manager] New session ${result.sessionId.slice(0, 8)}... ` +
          `(${result.inputTokens} in, ${result.outputTokens} out)`
      );
    } else {
      // Existing session - accumulate
      this.state.cumulativeInputTokens += result.inputTokens;
      this.state.cumulativeOutputTokens += result.outputTokens;
      this.state.totalCostUsd += result.costUsd;
      this.state.lastUsedAt = now;
      this.state.messageCount += 1;

      const stats = this.getStats();
      console.log(
        `[session-manager] Session ${result.sessionId.slice(0, 8)}... ` +
          `msg #${this.state.messageCount}, ` +
          `${stats.totalTokens.toLocaleString()}/${stats.threshold.toLocaleString()} tokens ` +
          `(${(stats.utilization * 100).toFixed(1)}%)`
      );
    }

    this.save();
  }

  /**
   * Reset session state (force fresh start)
   */
  reset(): void {
    if (this.state) {
      console.log(
        `[session-manager] Resetting session ${this.state.sessionId?.slice(0, 8)}... ` +
          `after ${this.state.messageCount} messages, ` +
          `$${this.state.totalCostUsd.toFixed(4)} spent`
      );
    }
    this.state = null;
    this.save();
  }

  /**
   * Get current stats for logging/debugging
   */
  getStats(): {
    totalTokens: number;
    threshold: number;
    utilization: number;
    messageCount: number;
    sessionId: string | null;
    costUsd: number;
  } {
    const totalTokens =
      (this.state?.cumulativeInputTokens ?? 0) + (this.state?.cumulativeOutputTokens ?? 0);
    const threshold = this.config.maxContextTokens * this.config.contextThreshold;

    return {
      totalTokens,
      threshold,
      utilization: totalTokens / this.config.maxContextTokens,
      messageCount: this.state?.messageCount ?? 0,
      sessionId: this.state?.sessionId ?? null,
      costUsd: this.state?.totalCostUsd ?? 0,
    };
  }

  /**
   * Get current state (for debugging/logging)
   */
  getState(): SessionState | null {
    return this.state;
  }
}

// Singleton instance
let instance: SessionManager | null = null;

export function getSessionManager(config?: Partial<SessionManagerConfig>): SessionManager {
  if (!instance) {
    instance = new SessionManager(config);
    instance.load();
  }
  return instance;
}

export function resetSessionManager(): void {
  if (instance) {
    instance.reset();
  }
  instance = null;
}
