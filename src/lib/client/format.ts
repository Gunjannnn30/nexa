import { format, formatDistanceToNowStrict, isSameDay, isToday, isYesterday } from "date-fns";

export function timeShort(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  return format(date, "HH:mm");
}

export function relative(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  return formatDistanceToNowStrict(date, { addSuffix: false })
    .replace("seconds", "s")
    .replace("second", "s")
    .replace("minutes", "m")
    .replace("minute", "m")
    .replace("hours", "h")
    .replace("hour", "h")
    .replace("days", "d")
    .replace("day", "d")
    .replace("months", "mo")
    .replace("month", "mo")
    .replace("years", "y")
    .replace("year", "y");
}

export function listTime(value: string) {
  const date = new Date(value);
  if (isToday(date)) return format(date, "HH:mm");
  if (isYesterday(date)) return "Yesterday";
  return format(date, "d MMM");
}

export function dayLabel(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  return format(date, "EEEE, d MMMM");
}

export function isSameDayValue(a: string | Date, b: string | Date) {
  return isSameDay(typeof a === "string" ? new Date(a) : a, typeof b === "string" ? new Date(b) : b);
}

export function messagePreview(body: string, max = 90) {
  const clean = body.replace(/\s+/g, " ").trim();
  if (!clean) return "";
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

export function lastSeenLabel(value: string | null) {
  if (!value) return "Offline";
  const date = new Date(value);
  if (Date.now() - date.getTime() < 60_000) return "Last seen just now";
  return `Last seen ${relative(date)} ago`;
}

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
