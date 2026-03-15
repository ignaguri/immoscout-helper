import type { ConversationEntry } from '../../shared/types';
import { MESSENGER_BASE_URL } from '../../shared/constants';

// Parse a date string to a Date object.
// Tries ISO format first, then German DD.MM.YYYY format.
function parseDate(dateStr: string, timeStr: string): Date | null {
  if (!dateStr) return null;

  let date: Date;

  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    // ISO format: YYYY-MM-DD
    date = new Date(`${dateStr}T${timeStr || '00:00'}:00`);
  } else if (/^\d{2}\.\d{2}\.\d{4}$/.test(dateStr)) {
    // German format: DD.MM.YYYY
    const [day, month, year] = dateStr.split('.');
    date = new Date(`${year}-${month}-${day}T${timeStr || '00:00'}:00`);
  } else {
    // Fallback: let the Date constructor try
    date = new Date(`${dateStr} ${timeStr || ''}`);
  }

  return isNaN(date.getTime()) ? null : date;
}

// Format a Date to Google Calendar format (local time): YYYYMMDDTHHmmSS
function formatDatetime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `T${pad(date.getHours())}${pad(date.getMinutes())}00`
  );
}

// Format a Date to ICS format in UTC: YYYYMMDDTHHmmSSZ
function formatDatetimeUTC(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}00Z`
  );
}

function buildEventData(conv: ConversationEntry): {
  title: string;
  location: string;
  description: string;
  start: Date | null;
  end: Date | null;
} {
  const appt = conv.appointment;
  const location = appt?.address || appt?.location || conv.listingTitle || '';
  const conversationUrl = `${MESSENGER_BASE_URL}${conv.conversationId}`;

  // Parse start time: prefer ISO `start` field, fall back to legacy date/time fields
  let start: Date | null = null;
  if (appt?.start) {
    const d = new Date(appt.start);
    start = isNaN(d.getTime()) ? null : d;
  } else {
    const dateStr = appt?.date || appt?.startDate || '';
    const timeStr = appt?.time || appt?.startTime || '';
    start = parseDate(dateStr, timeStr);
  }

  // Compute end time from duration (API returns minutes as number)
  let end: Date | null = null;
  if (start) {
    end = new Date(start);
    let durationMinutes = 60; // default 1 hour
    if (typeof appt?.duration === 'number') {
      durationMinutes = appt.duration;
    } else if (typeof appt?.duration === 'string') {
      const hourMatch = appt.duration.match(/(\d+)\s*h/i);
      const minMatch = appt.duration.match(/(\d+)\s*m/i);
      const h = hourMatch ? parseInt(hourMatch[1]) : 0;
      const m = minMatch ? parseInt(minMatch[1]) : 0;
      durationMinutes = h * 60 + m || 60;
    }
    end.setMinutes(end.getMinutes() + durationMinutes);
  }

  const description = [
    `Vermieter: ${conv.landlordName || ''}`,
    `Wohnung: ${conv.listingTitle || ''}`,
    location ? `Ort: ${location}` : '',
    `Konversation: ${conversationUrl}`,
  ]
    .filter(Boolean)
    .join('\n');

  return {
    title: `Besichtigung: ${conv.listingTitle || conv.referenceId || ''}`,
    location,
    description,
    start,
    end,
  };
}

export function buildGoogleCalendarUrl(conv: ConversationEntry): string {
  const { title, location, description, start, end } = buildEventData(conv);

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    details: description,
    location,
  });

  if (start && end) {
    params.set('dates', `${formatDatetime(start)}/${formatDatetime(end)}`);
  }

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function downloadICS(conv: ConversationEntry): void {
  const { title, location, description, start, end } = buildEventData(conv);

  const now = formatDatetimeUTC(new Date());
  const dtstart = start ? formatDatetimeUTC(start) : now;
  const dtend = end ? formatDatetimeUTC(end) : dtstart;

  // Escape special chars per RFC 5545: backslashes first, then others
  const esc = (s: string) =>
    s.replace(/\\/g, '\\\\')
     .replace(/\r\n|\r|\n/g, '\\n')
     .replace(/,/g, '\\,')
     .replace(/;/g, '\\;');

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ImmoScout Extension//EN',
    'BEGIN:VEVENT',
    `UID:${conv.conversationId}@immoscout-ext`,
    `DTSTAMP:${now}`,
    `DTSTART:${dtstart}`,
    `DTEND:${dtend}`,
    `SUMMARY:${esc(title)}`,
    `DESCRIPTION:${esc(description)}`,
    `LOCATION:${esc(location)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `besichtigung-${conv.conversationId}.ics`;
  a.click();
  // Delay revoke to ensure the browser has started the download
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
