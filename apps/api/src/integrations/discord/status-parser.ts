import { ReportPeriod } from "@prisma/client";

export type ParsedStatusTask = {
  period: ReportPeriod;
  projectName: string | null;
  description: string;
  durationMinutes: number | null;
  taskUrl: string | null;
  sortOrder: number;
};

export type ParsedDiscordStatus = {
  reportDate: Date;
  reportDateIso: string;
  tasks: ParsedStatusTask[];
};

const ACTION_WORDS = "worked|working|added|adding|fixed|fixing|implemented|implementing|prevented|preventing|investigated|investigating|paired|contacted|contacting|learned|learning|created|creating|started|starting|tested|testing|reviewed|reviewing|deployed|deploying|flagged|discussed|explored|exploring|enhanced|enhancing|ran|running|live";
const CAPITALIZED_ACTION_WORDS = "Worked|Working|Added|Adding|Fixed|Fixing|Implemented|Implementing|Prevented|Preventing|Investigated|Investigating|Paired|Contacted|Contacting|Learned|Learning|Created|Creating|Started|Starting|Tested|Testing|Reviewed|Reviewing|Deployed|Deploying|Flagged|Discussed|Explored|Exploring|Enhanced|Enhancing|Ran|Running|Live";
const STATUS_MARKER = /\s*\[(?:DONE|WIP|IN PROGRESS|BLOCKED|COMPLETED)\]\s*/gi;

function decodeFormatting(value: string) {
  return value
    .replace(/&#x20;|&#32;|&nbsp;/gi, " ")
    .replace(/\u00a0/g, " ")
    .replace(/\*\*/g, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "");
}

function dateValue(day: number, month: number, rawYear: number) {
  const year = rawYear < 100 ? 2000 + rawYear : rawYear;
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

function datedSections(content: string) {
  const value = decodeFormatting(content);
  const datePattern = /(?:^|[\s"'])(?:\d+\.\s*)?(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?=\s|:|$)\s*:?/gm;
  const matches: Array<{ index: number; bodyStart: number; date: NonNullable<ReturnType<typeof dateValue>> }> = [];
  let match: RegExpExecArray | null;

  while ((match = datePattern.exec(value)) !== null) {
    const context = value.slice(Math.max(0, match.index - 30), match.index);
    if (/leave\s+on\s*["']?$/i.test(context)) continue;
    const date = dateValue(Number(match[1]), Number(match[2]), Number(match[3]));
    if (date) matches.push({ index: match.index, bodyStart: datePattern.lastIndex, date });
  }

  return matches.map((item, index) => ({
    ...item.date,
    body: value.slice(item.bodyStart, matches[index + 1]?.index ?? value.length).trim()
  }));
}

function parseDuration(value: string) {
  let minutes = 0;
  let found = false;
  for (const match of value.matchAll(/(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m)\b/gi)) {
    found = true;
    const amount = Number(match[1]);
    minutes += match[2].toLowerCase().startsWith("h") ? amount * 60 : amount;
  }
  return found ? Math.round(minutes) : null;
}

function extractUrl(value: string) {
  const markdownUrl = value.match(/\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/i);
  const plainUrl = value.match(/https?:\/\/[^\s)>]+/i);
  return (markdownUrl?.[1] ?? plainUrl?.[0] ?? null)?.replace(/[.,;]+$/, "") ?? null;
}

function cleanDescription(value: string) {
  return value
    .replace(STATUS_MARKER, " ")
    .replace(/\[[^\]]*\]\(https?:\/\/[^)\s]+\)/gi, " ")
    .replace(/https?:\/\/[^\s)>]+/gi, " ")
    .replace(/\(?\s*\d+(?:\.\d+)?\s*(?:hours?|hrs?|h|minutes?|mins?|m)\b\s*\)?/gi, " ")
    .replace(/^\s*(?:[-*]|\d+[.)])\s+/, "")
    .replace(/\s+(?:—|–|-)\s*[.]?$/, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s:–—-]+|[\s:–—-]+$/g, "")
    .trim();
}

function logicalLines(section: string) {
  const taskMarkdownLink = /(Task\s*:\s*\[[^\]]*\]\(https?:\/\/[^)]+\)\s*(?:\[(?:DONE|WIP|IN PROGRESS|BLOCKED|COMPLETED)\])?)/gi;
  const taskPlainLink = /(Task\s*:\s*https?:\/\/[^\s]+\s*(?:\[(?:DONE|WIP|IN PROGRESS|BLOCKED|COMPLETED)\])?)/gi;
  const projectAction = new RegExp(`\\s+(?=[A-Z][A-Za-z0-9&-]{2,30}\\s+(?:${CAPITALIZED_ACTION_WORDS})\\b)`, "g");

  return section
    .replace(taskMarkdownLink, "\n$1\n")
    .replace(taskPlainLink, "\n$1\n")
    .replace(projectAction, "\n")
    .replace(/[ \t]{2,}/g, "\n")
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*]|\d+[.)])\s+/, "").trim())
    .filter(Boolean);
}

function inlineProjectAndTask(value: string) {
  const match = value.match(new RegExp(`^(.{1,50}?)\\s+((?:(?:${ACTION_WORDS})\\b|[A-Z]{2,}-\\d+\\b).*)$`, "i"));
  if (!match) return null;
  const project = match[1].replace(/:$/, "").trim();
  const projectStartsWithAction = new RegExp(`^(?:${ACTION_WORDS})\\b`, "i").test(project);
  return project.split(/\s+/).length <= 4 && !projectStartsWithAction ? { project, task: match[2].trim() } : null;
}

function isProjectHeading(value: string, nextLine?: string) {
  const withoutMarker = value.replace(STATUS_MARKER, "").trim();
  if (extractUrl(withoutMarker) || parseDuration(withoutMarker) !== null) return false;
  if (/:$/.test(withoutMarker)) return true;
  const words = withoutMarker.split(/\s+/);
  return words.length <= 4
    && !/[.!?]$/.test(withoutMarker)
    && Boolean(nextLine && (parseDuration(nextLine) !== null || /^[-*]\s+/.test(nextLine)));
}

function parseTodaySection(section: string) {
  const lines = logicalLines(section);
  const tasks: ParsedStatusTask[] = [];
  let projectName: string | null = null;
  let inheritedTaskUrl: string | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    let line = lines[index];

    if (/^task\s*:/i.test(line)) {
      const lastTask = tasks.at(-1);
      if (lastTask) lastTask.taskUrl = extractUrl(line);
      continue;
    }

    const headingLink = line.replace(STATUS_MARKER, "").trim().match(/^(.{1,80}?)\s+\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)\s*$/i);
    if (headingLink && parseDuration(line) === null) {
      projectName = headingLink[1].replace(/:$/, "").trim();
      inheritedTaskUrl = headingLink[3];
      continue;
    }

    const inline = inlineProjectAndTask(line);
    if (inline) {
      projectName = inline.project;
      inheritedTaskUrl = null;
      line = inline.task;
    } else if (isProjectHeading(line, lines[index + 1])) {
      projectName = line.replace(STATUS_MARKER, "").replace(/:$/, "").trim();
      inheritedTaskUrl = null;
      continue;
    }

    const description = cleanDescription(line);
    const taskUrl = extractUrl(line) ?? inheritedTaskUrl;
    if (!description) {
      const lastTask = tasks.at(-1);
      if (lastTask && taskUrl) lastTask.taskUrl = taskUrl;
      continue;
    }

    tasks.push({
      period: ReportPeriod.TODAY,
      projectName,
      description,
      durationMinutes: parseDuration(line),
      taskUrl,
      sortOrder: tasks.length
    });
  }

  return tasks;
}

export function parseDiscordStatuses(content: string): ParsedDiscordStatus[] {
  const reports: ParsedDiscordStatus[] = [];

  for (const section of datedSections(content)) {
    const todayMarker = /\btoday\s*:/i.exec(section.body);
    const hasYesterdayMarker = /\byesterday\s*:/i.test(section.body);
    const todayContent = todayMarker
      ? section.body.slice(todayMarker.index + todayMarker[0].length)
      : hasYesterdayMarker ? "" : section.body;
    const tasks = parseTodaySection(todayContent.replace(/^[\s:'"]+|[\s'"]+$/g, ""));
    if (tasks.length) reports.push({ reportDate: section.reportDate, reportDateIso: section.reportDateIso, tasks });
  }

  return reports;
}

export function parseDiscordStatus(content: string): ParsedDiscordStatus | null {
  return parseDiscordStatuses(content)[0] ?? null;
}
