export type RecencyBucket = "Today" | "Yesterday" | "Past week" | "Last 30 days" | "Older";

export const RECENCY_ORDER: RecencyBucket[] = [
  "Today",
  "Yesterday",
  "Past week",
  "Last 30 days",
  "Older",
];

const DAY_MS = 86_400_000;

function dayStart(timestamp: number): number {
  const d = new Date(timestamp);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function recencyBucket(timestamp: number, now: number = Date.now()): RecencyBucket {
  const todayStart = dayStart(now);
  if (timestamp >= todayStart) return "Today";
  if (timestamp >= todayStart - DAY_MS) return "Yesterday";
  if (timestamp >= todayStart - 7 * DAY_MS) return "Past week";
  if (timestamp >= todayStart - 30 * DAY_MS) return "Last 30 days";
  return "Older";
}

export type DateFilter = "any" | "today" | "week" | "month" | "custom";

export interface CustomRange {
  from: number | null;
  to: number | null;
}

export function matchesDateFilter(
  timestamp: number,
  filter: DateFilter,
  customRange: CustomRange,
  now: number = Date.now(),
): boolean {
  const todayStart = dayStart(now);
  switch (filter) {
    case "any":
      return true;
    case "today":
      return timestamp >= todayStart;
    case "week":
      return timestamp >= todayStart - 7 * DAY_MS;
    case "month":
      return timestamp >= todayStart - 30 * DAY_MS;
    case "custom": {
      if (customRange.from !== null && timestamp < customRange.from) return false;
      if (customRange.to !== null && timestamp >= customRange.to + DAY_MS) return false;
      return true;
    }
  }
}
