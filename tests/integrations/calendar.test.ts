import { describe, expect, test } from "bun:test";
import {
  parseServiceAccountJson,
  formatEventForDisplay,
  formatDateRange,
  type CalendarEvent,
} from "../../src/integrations/calendar";

describe("parseServiceAccountJson", () => {
  test("parses base64-encoded JSON", () => {
    const original = { client_email: "test@example.com", private_key: "key123" };
    const encoded = Buffer.from(JSON.stringify(original)).toString("base64");
    const result = parseServiceAccountJson(encoded);
    expect(result?.client_email).toBe("test@example.com");
  });

  test("returns null for empty string", () => {
    const result = parseServiceAccountJson("");
    expect(result).toBeNull();
  });

  test("returns null for invalid base64", () => {
    const result = parseServiceAccountJson("not-valid-base64!!!");
    expect(result).toBeNull();
  });
});

describe("formatEventForDisplay", () => {
  test("formats event with time", () => {
    const event: CalendarEvent = {
      id: "1",
      calendarId: "cal@example.com",
      calendarName: "Work",
      summary: "Team Meeting",
      start: "2025-12-30T10:00:00Z",
      end: "2025-12-30T11:00:00Z",
      isAllDay: false,
    };
    const result = formatEventForDisplay(event);
    expect(result).toContain("Team Meeting");
    expect(result).toContain("Work");
  });

  test("formats all-day event", () => {
    const event: CalendarEvent = {
      id: "2",
      calendarId: "cal@example.com",
      calendarName: "Family",
      summary: "Birthday",
      start: "2025-12-30",
      end: "2025-12-31",
      isAllDay: true,
    };
    const result = formatEventForDisplay(event);
    expect(result).toContain("Birthday");
    expect(result).toContain("all day");
  });
});

describe("formatDateRange", () => {
  test("formats date range for API", () => {
    const start = new Date("2025-12-30T00:00:00Z");
    const end = new Date("2025-12-31T00:00:00Z");
    const result = formatDateRange(start, end);
    expect(result.timeMin).toBe("2025-12-30T00:00:00.000Z");
    expect(result.timeMax).toBe("2025-12-31T00:00:00.000Z");
  });
});
