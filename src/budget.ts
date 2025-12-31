import { getBlock, setBlock } from "./memory/blocks";

export function getDailyCap(): number {
  const raw = getBlock("budget_daily_cap");
  return raw ? parseFloat(raw) : 0;
}

export function setDailyCap(amount: number): void {
  setBlock("budget_daily_cap", amount.toFixed(2), 4);
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
    // New day in Berlin - reset
    setDailySpent(0);
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
