import { describe, expect, test } from "bun:test";
import { formatCalendarSummary } from "../../src/perch/calendar";
import type { CalendarEvent } from "../../src/integrations/calendar";

describe("formatCalendarSummary", () => {
  test("formats events grouped by day", () => {
    const events: CalendarEvent[] = [
      {
        id: "1",
        calendarId: "work@example.com",
        calendarName: "work",
        summary: "Team Standup",
        start: "2025-12-30T09:00:00Z",
        end: "2025-12-30T09:30:00Z",
        isAllDay: false,
      },
      {
        id: "2",
        calendarId: "family@example.com",
        calendarName: "family",
        summary: "Dinner",
        start: "2025-12-30T18:00:00Z",
        end: "2025-12-30T20:00:00Z",
        isAllDay: false,
      },
    ];

    const summary = formatCalendarSummary(events);
    expect(summary).toContain("Team Standup");
    expect(summary).toContain("Dinner");
  });

  test("returns message for no events", () => {
    const summary = formatCalendarSummary([]);
    expect(summary).toContain("No upcoming events");
  });
});
