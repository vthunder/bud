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
        description: item.description ?? undefined,
        start: item.start?.dateTime || item.start?.date || "",
        end: item.end?.dateTime || item.end?.date || "",
        location: item.location ?? undefined,
        attendees: item.attendees?.map((a) => a.email || "").filter(Boolean),
        isAllDay: !item.start?.dateTime,
      }));

      allEvents.push(...events);
    } catch (error) {
      console.error(`[calendar] Failed to list events for ${calendarId}:`, error);
    }
  }

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
      description: item.description ?? undefined,
      start: item.start?.dateTime || item.start?.date || "",
      end: item.end?.dateTime || item.end?.date || "",
      location: item.location ?? undefined,
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
      description: item.description ?? undefined,
      start: item.start?.dateTime || item.start?.date || "",
      end: item.end?.dateTime || item.end?.date || "",
      location: item.location ?? undefined,
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
