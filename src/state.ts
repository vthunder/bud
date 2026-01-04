/**
 * Runtime State (In-memory only)
 *
 * Transient state for the current process. Not persisted to disk.
 * Resets on restart.
 */

export interface BudState {
  status: "idle" | "working" | "wrapping_up";
  current_task: string | null;
  started_at: string | null;
  session_budget: number;
  session_spent: number;
  preempt_requested: boolean;
  preempt_reason: string | null;
}

const DEFAULT_STATE: BudState = {
  status: "idle",
  current_task: null,
  started_at: null,
  session_budget: 0,
  session_spent: 0,
  preempt_requested: false,
  preempt_reason: null,
};

// In-memory state - no persistence
let currentState: BudState = { ...DEFAULT_STATE };

export function getState(): BudState {
  return { ...currentState };
}

export function setState(updates: Partial<BudState>): void {
  currentState = { ...currentState, ...updates };
}

export function requestPreempt(reason: string): void {
  setState({ preempt_requested: true, preempt_reason: reason });
}

export function clearPreempt(): void {
  setState({ preempt_requested: false, preempt_reason: null });
}

export function shouldYield(): boolean {
  const state = getState();

  // Yield if preemption requested
  if (state.preempt_requested) return true;

  // Yield if budget exceeded (allowing 15% buffer for wrap-up)
  if (state.session_budget > 0) {
    const budgetWithBuffer = state.session_budget * 1.15;
    if (state.session_spent >= budgetWithBuffer) return true;
  }

  return false;
}

export function isWrappingUp(): boolean {
  const state = getState();
  if (state.session_budget <= 0) return false;
  // Wrapping up when past 85% of budget
  return state.session_spent >= state.session_budget * 0.85;
}
