import { ReportPeriod, TaskStatus } from "@prisma/client";

export type ParsedStatusTask = {
  period: ReportPeriod;
  projectName: string | null;
  description: string;
  durationMinutes: number | null;
  taskUrl: string | null;
  status: TaskStatus;
  sortOrder: number;
};

export type ParsedDiscordStatus = {
  reportDate: Date;
  reportDateIso: string;
  tasks: ParsedStatusTask[];
};

function cleanLine(value: string) {
  return value
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/^\s*[-*]\s+/, "")
    .replace(/^\*\*(.*?)\*\*$/, "$1")
    .trim();
}

function parseDate(value: string) {
  const match = value.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const reportDate = new Date(Date.UTC(year, month - 1, day));

  if (
    reportDate.getUTCFullYear() !== year ||
    reportDate.getUTCMonth() !== month - 1 ||
    reportDate.getUTCDate() !== day
  ) return null;

  return {
    reportDate,
    reportDateIso: `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`
  };
}

function parseDuration(value: string) {
  const hours = value.match(/(\d+(?:\.\d+)?)\s*h/i);
  const minutes = value.match(/(\d+)\s*m/i);
  if (!hours && !minutes) return null;
  return Math.round((hours ? Number(hours[1]) * 60 : 0) + (minutes ? Number(minutes[1]) : 0));
}

function extractUrl(value: string) {
  const markdownUrl = value.match(/\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/i);
  const plainUrl = value.match(/https?:\/\/[^\s)>]+/i);
  return (markdownUrl?.[1] ?? plainUrl?.[0] ?? null)?.replace(/[.,;]+$/, "") ?? null;
}

function taskStatus(period: ReportPeriod, marker?: string) {
  const normalized = marker?.trim().toUpperCase();
  if (normalized === "WIP" || normalized === "IN PROGRESS") return TaskStatus.IN_PROGRESS;
  if (normalized === "BLOCKED") return TaskStatus.BLOCKED;
  if (normalized === "DONE" || normalized === "COMPLETED") return TaskStatus.COMPLETED;
  return period === ReportPeriod.YESTERDAY ? TaskStatus.COMPLETED : TaskStatus.PLANNED;
}

export function parseDiscordStatus(content: string): ParsedDiscordStatus | null {
  const lines = content.split(/\r?\n/).map(cleanLine).filter(Boolean);
  const dateIndex = lines.findIndex((line) => parseDate(line) !== null);
  if (dateIndex < 0) return null;

  const parsedDate = parseDate(lines[dateIndex])!;
  const tasks: ParsedStatusTask[] = [];
  let period: ReportPeriod | null = null;
  let projectName: string | null = null;

  for (const line of lines.slice(dateIndex + 1)) {
    if (/^yesterday\s*:?$/i.test(line)) {
      period = ReportPeriod.YESTERDAY;
      projectName = null;
      continue;
    }
    if (/^today\s*:?$/i.test(line)) {
      period = ReportPeriod.TODAY;
      projectName = null;
      continue;
    }
    if (!period) continue;

    if (/^task\s*:/i.test(line)) {
      const lastTask = tasks.at(-1);
      if (lastTask?.period === period) {
        lastTask.taskUrl = extractUrl(line);
        const marker = line.match(/\[([^\]]+)\]\s*$/)?.[1];
        if (marker && !/^https?:/i.test(marker)) lastTask.status = taskStatus(period, marker);
      }
      continue;
    }

    const taskMatch = line.match(/^(.*?)\s+(?:—|–|-)\s*((?:(?:\d+(?:\.\d+)?)\s*h)?\s*(?:(?:\d+)\s*m)?)\s*(?:\[([^\]]+)\])?\s*$/i);
    const durationMinutes = taskMatch ? parseDuration(taskMatch[2]) : null;

    if (taskMatch && durationMinutes !== null) {
      tasks.push({
        period,
        projectName,
        description: taskMatch[1].trim(),
        durationMinutes,
        taskUrl: extractUrl(line),
        status: taskStatus(period, taskMatch[3]),
        sortOrder: tasks.filter((task) => task.period === period).length
      });
      continue;
    }

    // A non-task line inside a period is the project heading for following tasks.
    if (!extractUrl(line)) projectName = line.replace(/:$/, "").trim();
  }

  return tasks.length > 0 ? { ...parsedDate, tasks } : null;
}
