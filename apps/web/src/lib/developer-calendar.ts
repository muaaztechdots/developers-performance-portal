const REPORTING_TIME_ZONE = "Asia/Karachi";

function normalizeDate(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

export function yesterdayInPakistan(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: REPORTING_TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric"
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  const yesterday = new Date(Date.UTC(value("year"), value("month") - 1, value("day")));
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  return yesterday.toISOString().slice(0, 10);
}

export type DeveloperCalendarDay = {
  date: string;
  isWeekend: boolean;
};

export function buildDeveloperCalendar(reportDates: string[], endDate = yesterdayInPakistan()) {
  const normalizedEndDate = normalizeDate(endDate);
  if (!normalizedEndDate) return [];

  const existingDates = reportDates
    .map(normalizeDate)
    .filter((date): date is string => date !== null)
    .filter((date) => date <= normalizedEndDate);
  const startDate = existingDates.sort()[0] ?? normalizedEndDate;
  const cursor = new Date(`${normalizedEndDate}T00:00:00.000Z`);
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const days: DeveloperCalendarDay[] = [];

  while (cursor >= start) {
    const dayOfWeek = cursor.getUTCDay();
    days.push({
      date: cursor.toISOString().slice(0, 10),
      isWeekend: dayOfWeek === 0 || dayOfWeek === 6
    });
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  return days;
}
