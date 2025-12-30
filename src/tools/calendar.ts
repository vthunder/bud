import { z } from "zod";
import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { config } from "../config";
import {
  listEvents,
  getEvent,
  createEvent,
  getFreeBusy,
  formatEventForDisplay,
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
