import { getBlock, setBlock } from "./memory/blocks";

export function getDailyCap(): number {
  const raw = getBlock("budget_daily_cap");
  return raw ? parseFloat(raw) : 0;
}

export function setDailyCap(amount: number): void {
  setBlock("budget_daily_cap", amount.toFixed(4), 4);
}

export function getDailySpent(): number {
  const raw = getBlock("budget_daily_spent");
  return raw ? parseFloat(raw) : 0;
}

export function setDailySpent(amount: number): void {
  setBlock("budget_daily_spent", amount.toFixed(4), 4);
}

export function trackCost(amount: number): void {
  const current = getDailySpent();
  setDailySpent(current + amount);
}

export function getRemainingBudget(): number {
  return getDailyCap() - getDailySpent();
}

// Token tracking (for context management and detailed logging)
export function getDailyInputTokens(): number {
  const raw = getBlock("budget_daily_input_tokens");
  return raw ? parseInt(raw, 10) : 0;
}

export function getDailyOutputTokens(): number {
  const raw = getBlock("budget_daily_output_tokens");
  return raw ? parseInt(raw, 10) : 0;
}

export function setDailyInputTokens(tokens: number): void {
  setBlock("budget_daily_input_tokens", tokens.toString(), 3);
}

export function setDailyOutputTokens(tokens: number): void {
  setBlock("budget_daily_output_tokens", tokens.toString(), 3);
}

export function trackTokens(inputTokens: number, outputTokens: number): void {
  const currentInput = getDailyInputTokens();
  const currentOutput = getDailyOutputTokens();
  setDailyInputTokens(currentInput + inputTokens);
  setDailyOutputTokens(currentOutput + outputTokens);
}

export function getDailyTokens(): { input: number; output: number; total: number } {
  const input = getDailyInputTokens();
  const output = getDailyOutputTokens();
  return { input, output, total: input + output };
}

export function getLastResetDate(): string | null {
  return getBlock("budget_last_reset");
}

export function setLastResetDate(date: string): void {
  setBlock("budget_last_reset", date, 4);
}

export function checkDailyReset(timezone: string = "Europe/Berlin"): boolean {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const todayInTz = formatter.format(now); // YYYY-MM-DD

  const lastReset = getLastResetDate();

  if (lastReset !== todayInTz) {
    // New day in Berlin - reset all counters
    setDailySpent(0);
    setDailyInputTokens(0);
    setDailyOutputTokens(0);
    setLastResetDate(todayInTz);
    return true;
  }

  return false;
}

export function formatBudgetStatus(): string {
  const cap = getDailyCap();
  const spent = getDailySpent();
  const remaining = getRemainingBudget();
  return `$${spent.toFixed(2)} / $${cap.toFixed(2)} (${remaining.toFixed(2)} remaining)`;
}
