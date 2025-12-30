# Bud Phase 5: Calendar Integration Design

## Overview

Bud gains Google Calendar awareness with a 7-day horizon. Rather than hardcoded notification rules, Bud uses its intelligence and learned preferences to decide which events warrant preparation or reminders.

## Key Design Decisions

- **Google Calendar** with Service Account authentication
- **Read + Write** access (query and create events, no update/delete)
- **Perch + on-demand tools** - Calendar in perch context, plus MCP tools for queries
- **Implicit learning** - Bud learns preferences through conversation, not explicit rules
- **7-day horizon** - Enough runway for meaningful preparation
- **No state file** - Unlike GitHub, no "seen" tracking; Bud sees calendar fresh each tick

## Configuration

**Environment variables:**
- `GOOGLE_SERVICE_ACCOUNT_JSON` - Base64-encoded service account key file
- `GOOGLE_CALENDAR_IDS` - Comma-separated calendar IDs (e.g., `user@gmail.com,family123@group.calendar.google.com`)

**Config addition:**
```typescript
calendar: {
  serviceAccountJson: process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? "",
  calendarIds: (process.env.GOOGLE_CALENDAR_IDS ?? "").split(",").filter(Boolean),
}
```

## Authentication

Uses Google Service Account for server-to-server auth:
1. Decode `GOOGLE_SERVICE_ACCOUNT_JSON` from base64
2. Use `google-auth-library` to create JWT client
3. Authorize with calendar scope (`calendar.events`)

**Setup steps (one-time):**
1. Create Google Cloud project
2. Enable Calendar API
3. Create service account, download JSON key
4. Share your calendar with the service account email
5. Base64-encode: `base64 -i key.json`
6. Set env vars in Dokku

## New Files

- `src/integrations/calendar.ts` - Google Calendar API wrapper
- `src/tools/calendar.ts` - MCP tools for on-demand access
- `src/perch/calendar.ts` - Formats calendar context for perch

## Calendar API Wrapper

**`src/integrations/calendar.ts`:**

```typescript
interface CalendarEvent {
  id: string;
  calendarId: string;        // Which calendar this event belongs to
  calendarName: string;      // Display name (e.g., "Family" or "Work")
  summary: string;           // Event title
  description?: string;      // Event description/notes
  start: string;            // ISO datetime
  end: string;              // ISO datetime
  location?: string;
  attendees?: string[];     // Email addresses
  isAllDay: boolean;
}

interface CreateEventParams {
  summary: string;
  start: string;
  end: string;
  description?: string;
  location?: string;
  calendarId?: string;      // Defaults to first configured calendar
}

interface BusySlot {
  start: string;
  end: string;
}

// Functions (operate across all configured calendars)
listEvents(startDate: Date, endDate: Date): Promise<CalendarEvent[]>
getEvent(calendarId: string, eventId: string): Promise<CalendarEvent | null>
createEvent(event: CreateEventParams): Promise<CalendarEvent>
getFreeBusy(startDate: Date, endDate: Date): Promise<BusySlot[]>
```

**Dependency:** `googleapis` npm package

## MCP Tools

**`src/tools/calendar.ts`** - Four tools:

| Tool | Description | Parameters |
|------|-------------|------------|
| `calendar_events` | List events in date range (all calendars) | `start_date?`, `end_date?` (defaults to next 7 days) |
| `calendar_event_details` | Get full details of one event | `event_id`, `calendar_id` |
| `calendar_create_event` | Create a new event | `summary`, `start`, `end`, `description?`, `location?`, `calendar_id?` (defaults to first) |
| `calendar_availability` | Check free/busy times (all calendars) | `start_date`, `end_date` |

## Perch Integration

**`src/perch/calendar.ts`:**

```typescript
async function getCalendarContext(): Promise<{
  summary: string;
  events: CalendarEvent[];
}>
```

**Perch prompt addition:**

```
## Calendar (Next 7 Days)
${calendarSummary}

Use your judgment about which events warrant preparation or reminders.
Consider: event type, attendees, your knowledge of the owner's preferences.
```

**How Bud decides what's relevant:**
- Time until event (meeting in 30 min vs 5 days)
- Event characteristics (1:1 vs all-hands vs external client call)
- Learned preferences from past conversations
- Context from event description and attendees

## Implementation Tasks

1. Add googleapis dependency
2. Add calendar config
3. Create calendar API wrapper with tests
4. Create calendar MCP tools
5. Create calendar perch context formatter
6. Integrate with perch context
7. Update perch decision prompt
8. Update tests
9. Test and deploy
