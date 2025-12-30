# Bud Phase 5: Calendar Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Google Calendar awareness with multi-calendar support, letting Bud intelligently decide what events warrant attention based on context and learned preferences.

**Architecture:** Use Google Calendar API with Service Account auth. Surface 7-day calendar context in perch ticks for intelligent decision-making. Expose MCP tools for on-demand queries and event creation.

**Tech Stack:** googleapis npm package, TypeScript, Zod for validation

---

## Task 1: Add googleapis Dependency

**Files:**
- Modify: `package.json`

**Step 1: Install googleapis**

```bash
bun add googleapis
```

**Step 2: Verify installation**

Run: `bun run typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add package.json bun.lock
git commit -m "feat: add googleapis dependency"
```

---

## Task 2: Add Calendar Config

**Files:**
- Modify: `src/config.ts`

**Step 1: Add calendar config section**

Add to the config object:

```typescript
calendar: {
  serviceAccountJson: process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? "",
  calendarIds: (process.env.GOOGLE_CALENDAR_IDS ?? "").split(",").filter(Boolean),
},
```

Note: Don't add to required validation - calendar is optional.

**Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add src/config.ts
git commit -m "feat: add calendar config"
```

---

## Task 3: Create Calendar API Wrapper with Tests

**Files:**
- Create: `src/integrations/calendar.ts`
- Create: `tests/integrations/calendar.test.ts`

**Step 1: Write tests for calendar wrapper**

Create `tests/integrations/calendar.test.ts`:

```typescript
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
```

**Step 2: Run tests to verify they fail**

Run: `bun test tests/integrations/calendar.test.ts`
Expected: FAIL - module not found

**Step 3: Implement calendar wrapper**

Create `src/integrations/calendar.ts`:

```typescript
import { google } from "googleapis";
import { config } from "../config";

export interface CalendarEvent {
  id: string;
  calendarId: string;
  calendarName: string;
  summary: string;
  description?: string;
  start: string;
  end: string;
  location?: string;
  attendees?: string[];
  isAllDay: boolean;
}

export interface CreateEventParams {
  summary: string;
  start: string;
  end: string;
  description?: string;
  location?: string;
  calendarId?: string;
}

export interface BusySlot {
  start: string;
  end: string;
}

export function parseServiceAccountJson(encoded: string): any | null {
  if (!encoded.trim()) return null;
  try {
    const decoded = Buffer.from(encoded, "base64").toString("utf-8");
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

export function formatEventForDisplay(event: CalendarEvent): string {
  const timeStr = event.isAllDay
    ? "all day"
    : `${new Date(event.start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
  return `[${event.calendarName}] ${event.summary} (${timeStr})`;
}

export function formatDateRange(start: Date, end: Date): { timeMin: string; timeMax: string } {
  return {
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
  };
}

function createCalendarClient() {
  const credentials = parseServiceAccountJson(config.calendar.serviceAccountJson);
  if (!credentials) return null;

  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ["https://www.googleapis.com/auth/calendar"],
  });

  return google.calendar({ version: "v3", auth });
}

export async function listEvents(startDate: Date, endDate: Date): Promise<CalendarEvent[]> {
  const client = createCalendarClient();
  if (!client) return [];

  const { timeMin, timeMax } = formatDateRange(startDate, endDate);
  const allEvents: CalendarEvent[] = [];

  for (const calendarId of config.calendar.calendarIds) {
    try {
      const response = await client.events.list({
        calendarId,
        timeMin,
        timeMax,
        singleEvents: true,
        orderBy: "startTime",
        maxResults: 50,
      });

      const calendarName = calendarId.split("@")[0] || calendarId;
      const events = (response.data.items || []).map((item): CalendarEvent => ({
        id: item.id || "",
        calendarId,
        calendarName,
        summary: item.summary || "(No title)",
        description: item.description,
        start: item.start?.dateTime || item.start?.date || "",
        end: item.end?.dateTime || item.end?.date || "",
        location: item.location,
        attendees: item.attendees?.map((a) => a.email || "").filter(Boolean),
        isAllDay: !item.start?.dateTime,
      }));

      allEvents.push(...events);
    } catch (error) {
      console.error(`[calendar] Failed to list events for ${calendarId}:`, error);
    }
  }

  // Sort all events by start time
  return allEvents.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
}

export async function getEvent(calendarId: string, eventId: string): Promise<CalendarEvent | null> {
  const client = createCalendarClient();
  if (!client) return null;

  try {
    const response = await client.events.get({ calendarId, eventId });
    const item = response.data;
    const calendarName = calendarId.split("@")[0] || calendarId;

    return {
      id: item.id || "",
      calendarId,
      calendarName,
      summary: item.summary || "(No title)",
      description: item.description,
      start: item.start?.dateTime || item.start?.date || "",
      end: item.end?.dateTime || item.end?.date || "",
      location: item.location,
      attendees: item.attendees?.map((a) => a.email || "").filter(Boolean),
      isAllDay: !item.start?.dateTime,
    };
  } catch (error) {
    console.error(`[calendar] Failed to get event ${eventId}:`, error);
    return null;
  }
}

export async function createEvent(params: CreateEventParams): Promise<CalendarEvent | null> {
  const client = createCalendarClient();
  if (!client) return null;

  const calendarId = params.calendarId || config.calendar.calendarIds[0];
  if (!calendarId) return null;

  try {
    const response = await client.events.insert({
      calendarId,
      requestBody: {
        summary: params.summary,
        description: params.description,
        location: params.location,
        start: { dateTime: params.start },
        end: { dateTime: params.end },
      },
    });

    const item = response.data;
    const calendarName = calendarId.split("@")[0] || calendarId;

    return {
      id: item.id || "",
      calendarId,
      calendarName,
      summary: item.summary || "(No title)",
      description: item.description,
      start: item.start?.dateTime || item.start?.date || "",
      end: item.end?.dateTime || item.end?.date || "",
      location: item.location,
      isAllDay: false,
    };
  } catch (error) {
    console.error("[calendar] Failed to create event:", error);
    return null;
  }
}

export async function getFreeBusy(startDate: Date, endDate: Date): Promise<BusySlot[]> {
  const client = createCalendarClient();
  if (!client) return [];

  const { timeMin, timeMax } = formatDateRange(startDate, endDate);

  try {
    const response = await client.freebusy.query({
      requestBody: {
        timeMin,
        timeMax,
        items: config.calendar.calendarIds.map((id) => ({ id })),
      },
    });

    const allBusy: BusySlot[] = [];
    const calendars = response.data.calendars || {};

    for (const calendarId of config.calendar.calendarIds) {
      const busy = calendars[calendarId]?.busy || [];
      allBusy.push(...busy.map((slot) => ({
        start: slot.start || "",
        end: slot.end || "",
      })));
    }

    return allBusy.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  } catch (error) {
    console.error("[calendar] Failed to get free/busy:", error);
    return [];
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `bun test tests/integrations/calendar.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/integrations/calendar.ts tests/integrations/calendar.test.ts
git commit -m "feat: add calendar API wrapper"
```

---

## Task 4: Create Calendar MCP Tools

**Files:**
- Create: `src/tools/calendar.ts`

**Step 1: Implement calendar MCP tools**

Create `src/tools/calendar.ts`:

```typescript
import { z } from "zod";
import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk/mcp";
import { config } from "../config";
import {
  listEvents,
  getEvent,
  createEvent,
  getFreeBusy,
  formatEventForDisplay,
  type CalendarEvent,
} from "../integrations/calendar";

export function createCalendarToolsServer() {
  const calendarEventsTool = tool(
    "calendar_events",
    "List calendar events in a date range. Returns events from all configured calendars.",
    {
      start_date: z.string().optional().describe("Start date (ISO format). Defaults to now."),
      end_date: z.string().optional().describe("End date (ISO format). Defaults to 7 days from now."),
    },
    async (args) => {
      if (config.calendar.calendarIds.length === 0) {
        return { content: [{ type: "text" as const, text: "Calendar not configured (no GOOGLE_CALENDAR_IDS)" }] };
      }

      try {
        const now = new Date();
        const startDate = args.start_date ? new Date(args.start_date) : now;
        const endDate = args.end_date ? new Date(args.end_date) : new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

        const events = await listEvents(startDate, endDate);

        if (events.length === 0) {
          return { content: [{ type: "text" as const, text: "No events found in date range" }] };
        }

        const formatted = events.map((e) => formatEventForDisplay(e)).join("\n");
        return { content: [{ type: "text" as const, text: formatted }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error listing events: ${error}` }] };
      }
    }
  );

  const calendarEventDetailsTool = tool(
    "calendar_event_details",
    "Get full details of a specific calendar event.",
    {
      event_id: z.string().describe("The event ID"),
      calendar_id: z.string().describe("The calendar ID the event belongs to"),
    },
    async (args) => {
      if (config.calendar.calendarIds.length === 0) {
        return { content: [{ type: "text" as const, text: "Calendar not configured" }] };
      }

      try {
        const event = await getEvent(args.calendar_id, args.event_id);
        if (!event) {
          return { content: [{ type: "text" as const, text: "Event not found" }] };
        }

        const details = [
          `**${event.summary}**`,
          `Calendar: ${event.calendarName}`,
          `Start: ${event.start}`,
          `End: ${event.end}`,
          event.location ? `Location: ${event.location}` : null,
          event.description ? `Description: ${event.description}` : null,
          event.attendees?.length ? `Attendees: ${event.attendees.join(", ")}` : null,
        ].filter(Boolean).join("\n");

        return { content: [{ type: "text" as const, text: details }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error getting event: ${error}` }] };
      }
    }
  );

  const calendarCreateEventTool = tool(
    "calendar_create_event",
    "Create a new calendar event.",
    {
      summary: z.string().describe("Event title"),
      start: z.string().describe("Start datetime (ISO format)"),
      end: z.string().describe("End datetime (ISO format)"),
      description: z.string().optional().describe("Event description"),
      location: z.string().optional().describe("Event location"),
      calendar_id: z.string().optional().describe("Calendar ID (defaults to first configured)"),
    },
    async (args) => {
      if (config.calendar.calendarIds.length === 0) {
        return { content: [{ type: "text" as const, text: "Calendar not configured" }] };
      }

      try {
        const event = await createEvent({
          summary: args.summary,
          start: args.start,
          end: args.end,
          description: args.description,
          location: args.location,
          calendarId: args.calendar_id,
        });

        if (!event) {
          return { content: [{ type: "text" as const, text: "Failed to create event" }] };
        }

        return { content: [{ type: "text" as const, text: `Created event: ${formatEventForDisplay(event)}` }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error creating event: ${error}` }] };
      }
    }
  );

  const calendarAvailabilityTool = tool(
    "calendar_availability",
    "Check free/busy times across all calendars.",
    {
      start_date: z.string().describe("Start date (ISO format)"),
      end_date: z.string().describe("End date (ISO format)"),
    },
    async (args) => {
      if (config.calendar.calendarIds.length === 0) {
        return { content: [{ type: "text" as const, text: "Calendar not configured" }] };
      }

      try {
        const startDate = new Date(args.start_date);
        const endDate = new Date(args.end_date);
        const busySlots = await getFreeBusy(startDate, endDate);

        if (busySlots.length === 0) {
          return { content: [{ type: "text" as const, text: "You appear to be free during this time range" }] };
        }

        const formatted = busySlots.map((slot) => `Busy: ${slot.start} - ${slot.end}`).join("\n");
        return { content: [{ type: "text" as const, text: formatted }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Error checking availability: ${error}` }] };
      }
    }
  );

  return createSdkMcpServer({
    name: "calendar",
    version: "1.0.0",
    tools: [calendarEventsTool, calendarEventDetailsTool, calendarCreateEventTool, calendarAvailabilityTool],
  });
}

export const CALENDAR_TOOL_NAMES = [
  "mcp__calendar__calendar_events",
  "mcp__calendar__calendar_event_details",
  "mcp__calendar__calendar_create_event",
  "mcp__calendar__calendar_availability",
];
```

**Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add src/tools/calendar.ts
git commit -m "feat: add calendar MCP tools"
```

---

## Task 5: Create Calendar Perch Context

**Files:**
- Create: `src/perch/calendar.ts`
- Create: `tests/perch/calendar.test.ts`

**Step 1: Write tests**

Create `tests/perch/calendar.test.ts`:

```typescript
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
```

**Step 2: Run tests to verify they fail**

Run: `bun test tests/perch/calendar.test.ts`
Expected: FAIL - module not found

**Step 3: Implement calendar perch context**

Create `src/perch/calendar.ts`:

```typescript
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
```

**Step 4: Run tests to verify they pass**

Run: `bun test tests/perch/calendar.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/perch/calendar.ts tests/perch/calendar.test.ts
git commit -m "feat: add calendar perch context"
```

---

## Task 6: Integrate Calendar with Perch Context

**Files:**
- Modify: `src/perch/context.ts`

**Step 1: Add calendar to perch context**

Add import at top:

```typescript
import { getCalendarContext } from "./calendar";
```

Add to `PerchContext` interface:

```typescript
calendarSummary: string;
```

Add to `gatherPerchContext` function:

```typescript
// Get calendar context
const { summary: calendarSummary } = await getCalendarContext();
```

Update return statement to include `calendarSummary`.

**Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add src/perch/context.ts
git commit -m "feat: add calendar to perch context"
```

---

## Task 7: Update Perch Decision Maker for Calendar

**Files:**
- Modify: `src/perch/decide.ts`

**Step 1: Add calendar section to prompt**

In `buildPerchPrompt`, add after the GitHub section:

```typescript
// Build calendar section
const calendarSection = context.calendarSummary
  ? `## Calendar (Next 7 Days)
${context.calendarSummary}

Use your judgment about which events warrant preparation or reminders.
Consider: event type, attendees, time until event, your knowledge of the owner's preferences.

`
  : "";
```

Include `${calendarSection}` in the prompt template after `${githubSection}`.

**Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add src/perch/decide.ts
git commit -m "feat: add calendar to perch decision prompt"
```

---

## Task 8: Update Tests

**Files:**
- Modify: `tests/perch/context.test.ts`
- Modify: `tests/perch/decide.test.ts`

**Step 1: Update context test**

Add mock for calendar module at top (after GitHub mock):

```typescript
const mockGetCalendarContext = mock(() =>
  Promise.resolve({ summary: "", events: [] })
);

mock.module("../../src/perch/calendar", () => ({
  getCalendarContext: mockGetCalendarContext,
}));
```

Add to beforeEach:

```typescript
mockGetCalendarContext.mockClear();
mockGetCalendarContext.mockResolvedValue({ summary: "", events: [] });
```

Add expectations for `calendarSummary` in tests.

**Step 2: Update decide test**

Add to `baseContext`:

```typescript
calendarSummary: "",
```

**Step 3: Run tests**

Run: `bun test tests/perch/context.test.ts tests/perch/decide.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add tests/perch/context.test.ts tests/perch/decide.test.ts
git commit -m "test: update tests for calendar integration"
```

---

## Task 9: Run All Tests

**Step 1: Run typecheck**

Run: `bun run typecheck`
Expected: No errors

**Step 2: Run calendar-related tests**

Run: `bun test tests/integrations/calendar.test.ts tests/perch/calendar.test.ts tests/perch/context.test.ts tests/perch/decide.test.ts`
Expected: All pass

**Step 3: Final commit (if any fixes needed)**

```bash
git status
```

---

## Deployment Notes

To enable calendar integration:

1. Create Google Cloud project and enable Calendar API
2. Create service account and download JSON key
3. Share calendar(s) with service account email
4. Base64-encode key: `base64 -i service-account.json`
5. Set env vars:
   - `GOOGLE_SERVICE_ACCOUNT_JSON=<base64-encoded-key>`
   - `GOOGLE_CALENDAR_IDS=primary@gmail.com,family@group.calendar.google.com`
