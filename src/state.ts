import { getBlock, setBlock } from "./memory/blocks";

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

export function getState(): BudState {
  const raw = getBlock("bud_state");
  if (!raw) return { ...DEFAULT_STATE };
  try {
    return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function setState(updates: Partial<BudState>): void {
  const current = getState();
  const newState = { ...current, ...updates };
  setBlock("bud_state", JSON.stringify(newState), 4);
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
