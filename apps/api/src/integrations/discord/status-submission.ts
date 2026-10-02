export type DiscordStatusSubmissionTask = {
  projectName: string;
  description: string;
  details: string;
  durationMinutes: number;
  taskUrl: string | null;
  pullRequestUrl?: string | null;
};

const DURATION_TOKEN = /(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m)(?![a-z])/gi;

export function parseSubmittedDuration(value: string) {
  DURATION_TOKEN.lastIndex = 0;
  const matches = [...value.trim().matchAll(DURATION_TOKEN)];
  if (!matches.length) return null;

  const remainder = value
    .replace(DURATION_TOKEN, "")
    .replace(/\band\b/gi, "")
    .replace(/[\s,+]/g, "");
  if (remainder) return null;

  const minutes = Math.round(matches.reduce((total, match) => {
    const amount = Number(match[1]);
    return total + (match[2].toLowerCase().startsWith("h") ? amount * 60 : amount);
  }, 0));

  return minutes > 0 && minutes <= 24 * 60 ? minutes : null;
}

export function containsDurationToken(value: string) {
  DURATION_TOKEN.lastIndex = 0;
  return DURATION_TOKEN.test(value);
}

export function normalizeStatusDetails(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^(?:[-*+]|\d+[.)])\s+/, "").trim())
    .filter(Boolean)
    .join("\n");
}

export function normalizeStatusUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function dateInTimeZone(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return new Date(Date.UTC(Number(value.year), Number(value.month) - 1, Number(value.day)));
}

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (!hours) return `${remainingMinutes}m`;
  if (!remainingMinutes) return `${hours}h`;
  return `${hours}h ${remainingMinutes}m`;
}

export function renderDiscordStatusSubmission(reportDate: Date, tasks: DiscordStatusSubmissionTask[]) {
  const date = [
    reportDate.getUTCDate().toString().padStart(2, "0"),
    (reportDate.getUTCMonth() + 1).toString().padStart(2, "0"),
    reportDate.getUTCFullYear()
  ].join("/");

  const taskBlocks = tasks.map((task) => {
    const details = task.details
      .split("\n")
      .filter(Boolean)
      .map((detail) => `- ${detail}`);
    return [
      task.projectName,
      `${task.description} (${formatDuration(task.durationMinutes)})`,
      ...details,
      ...(task.pullRequestUrl ? [`- PR: ${task.pullRequestUrl}`] : []),
      ...(task.taskUrl ? [`Task: ${task.taskUrl}`] : [])
    ].join("\n");
  });

  return [`${date}\n\nToday:`, ...taskBlocks].join("\n\n");
}
