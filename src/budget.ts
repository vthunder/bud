/**
 * Budget Tracking (In-memory only)
 *
 * Tracks daily budget usage. Resets on process restart.
 * This is intentional - budget tracking doesn't need persistence.
 */

interface BudgetState {
  dailyCap: number;
  dailySpent: number;
  dailyInputTokens: number;
  dailyOutputTokens: number;
  lastResetDate: string | null;
}

const DEFAULT_STATE: BudgetState = {
  dailyCap: 0,
  dailySpent: 0,
  dailyInputTokens: 0,
  dailyOutputTokens: 0,
  lastResetDate: null,
};

// In-memory state - resets on restart
let state: BudgetState = { ...DEFAULT_STATE };

export function getDailyCap(): number {
  return state.dailyCap;
}

export function setDailyCap(amount: number): void {
  state.dailyCap = amount;
}

export function getDailySpent(): number {
  return state.dailySpent;
}

export function setDailySpent(amount: number): void {
  state.dailySpent = amount;
}

export function trackCost(amount: number): void {
  state.dailySpent += amount;
}

export function getRemainingBudget(): number {
  return state.dailyCap - state.dailySpent;
}

// Token tracking (for context management and detailed logging)
export function getDailyInputTokens(): number {
  return state.dailyInputTokens;
}

export function getDailyOutputTokens(): number {
  return state.dailyOutputTokens;
}

export function setDailyInputTokens(tokens: number): void {
  state.dailyInputTokens = tokens;
}

export function setDailyOutputTokens(tokens: number): void {
  state.dailyOutputTokens = tokens;
}

export function trackTokens(inputTokens: number, outputTokens: number): void {
  state.dailyInputTokens += inputTokens;
  state.dailyOutputTokens += outputTokens;
}

export function getDailyTokens(): { input: number; output: number; total: number } {
  return {
    input: state.dailyInputTokens,
    output: state.dailyOutputTokens,
    total: state.dailyInputTokens + state.dailyOutputTokens,
  };
}

export function getLastResetDate(): string | null {
  return state.lastResetDate;
}

export function setLastResetDate(date: string): void {
  state.lastResetDate = date;
}

export function checkDailyReset(timezone: string = "Europe/Berlin"): boolean {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const todayInTz = formatter.format(now); // YYYY-MM-DD

  if (state.lastResetDate !== todayInTz) {
    // New day - reset all counters
    state.dailySpent = 0;
    state.dailyInputTokens = 0;
    state.dailyOutputTokens = 0;
    state.lastResetDate = todayInTz;
    return true;
  }

  return false;
}

export function formatBudgetStatus(): string {
  const cap = state.dailyCap;
  const spent = state.dailySpent;
  const remaining = getRemainingBudget();
  return `$${spent.toFixed(2)} / $${cap.toFixed(2)} (${remaining.toFixed(2)} remaining)`;
}

/**
 * Reset all budget state (for testing)
 */
export function resetBudgetState(): void {
  state = { ...DEFAULT_STATE };
}
