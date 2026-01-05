/**
 * Session Manager for Claude Code sessions (In-memory only)
 *
 * Manages session lifecycle to enable prompt reuse:
 * - Fresh sessions get full prompt (~6K tokens)
 * - Continuation sessions get minimal prompt (~500 tokens)
 * - Sessions reset at 25% context capacity to keep cache costs low
 *
 * State resets on process restart (intentional - sessions shouldn't persist).
 */

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
  // Claude CLI adds ~150K base context (system prompt, tools, etc.) which is cached.
  // We want sessions to continue until we've added ~30K of our own conversation,
  // so threshold is (150K base + 30K conversation) / 200K = 0.90
  contextThreshold: 0.90, // Reset at ~180K total tokens
};

export class SessionManager {
  private config: SessionManagerConfig;
  private state: SessionState | null = null;

  constructor(config: Partial<SessionManagerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Load session state - no-op for in-memory implementation
   * Kept for API compatibility
   */
  load(): void {
    // No persistence - state is already in memory
  }

  /**
   * Save session state - no-op for in-memory implementation
   * Kept for API compatibility
   */
  save(): void {
    // No persistence - state lives only in memory
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
  }
  return instance;
}

export function resetSessionManager(): void {
  if (instance) {
    instance.reset();
  }
  instance = null;
}
