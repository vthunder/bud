import { config } from "../config";
import { listEvents, formatEventForDisplay, type CalendarEvent } from "../integrations/calendar";

export async function getCalendarContext(): Promise<{
  summary: string;
  events: CalendarEvent[];
}> {
  if (config.calendar.calendarIds.length === 0) {
    return { summary: "", events: [] };
  }

  const now = new Date();
  const endDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  try {
    const events = await listEvents(now, endDate);
    const summary = formatCalendarSummary(events);
    return { summary, events };
  } catch (error) {
    console.error("[calendar] Failed to get calendar context:", error);
    return { summary: "", events: [] };
  }
}

export function formatCalendarSummary(events: CalendarEvent[]): string {
  if (events.length === 0) {
    return "No upcoming events in the next 7 days.";
  }

  const byDay = new Map<string, CalendarEvent[]>();

  for (const event of events) {
    const dayKey = new Date(event.start).toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
    if (!byDay.has(dayKey)) {
      byDay.set(dayKey, []);
    }
    byDay.get(dayKey)!.push(event);
  }

  const lines: string[] = [];
  for (const [day, dayEvents] of byDay) {
    lines.push(`**${day}:**`);
    for (const event of dayEvents) {
      lines.push(`  - ${formatEventForDisplay(event)}`);
    }
  }

  return lines.join("\n");
}
