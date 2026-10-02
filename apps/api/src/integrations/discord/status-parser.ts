import { ReportPeriod } from "@prisma/client";

export type ParsedStatusTask = {
  period: ReportPeriod;
  projectName: string | null;
  description: string;
  details: string | null;
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
const HAS_STATUS_MARKER = /\[(?:DONE|WIP|IN PROGRESS|BLOCKED|COMPLETED)\]/i;

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
  for (const match of value.matchAll(/(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m)(?![a-z])/gi)) {
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

function replaceMarkdownLinks(value: string) {
  return value.replace(/\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/gi, (_match, label: string) =>
    /^https?:\/\//i.test(label.trim()) ? " " : ` ${label} `
  );
}

function cleanDescription(value: string) {
  return replaceMarkdownLinks(value)
    .replace(STATUS_MARKER, " ")
    .replace(/https?:\/\/[^\s)>]+/gi, " ")
    .replace(/\(?\s*(?:\d+(?:\.\d+)?\s*(?:hours?|hrs?|h|minutes?|mins?|m)(?![a-z])\s*)+\)?/gi, " ")
    .replace(/^\s*(?:[-*]|\d+[.)])\s+/, "")
    .replace(/\s+(?:—|–|-)\s*[.]?$/, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s:–—-]+|[\s:–—-]+$/g, "")
    .trim();
}

function cleanDetail(value: string) {
  const keepPullRequestUrl = /^\s*(?:[-*]|\d+[.)])?\s*(?:pr|pull request)\s*:/i.test(value);
  const normalized = replaceMarkdownLinks(value).replace(STATUS_MARKER, " ");
  return (keepPullRequestUrl ? normalized : normalized.replace(/https?:\/\/[^\s)>]+/gi, " "))
    .replace(/^\s*(?:[-*]|\d+[.)])\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

type LogicalLine = { value: string; isBullet: boolean; startsBlock: boolean };

function logicalLines(section: string) {
  const taskMarkdownLink = /(Task\s*:\s*\[[^\]]*\]\(https?:\/\/[^)]+\)\s*(?:\[(?:DONE|WIP|IN PROGRESS|BLOCKED|COMPLETED)\])?)/gi;
  const taskPlainLink = /(Task\s*:\s*https?:\/\/[^\s]+\s*(?:\[(?:DONE|WIP|IN PROGRESS|BLOCKED|COMPLETED)\])?)/gi;
  const projectAction = new RegExp(`\\s+(?=[A-Z][A-Za-z0-9&-]{2,30}\\s+(?:${CAPITALIZED_ACTION_WORDS})\\b)`, "g");

  const normalized = section
    .replace(taskMarkdownLink, "\n$1\n")
    .replace(taskPlainLink, "\n$1\n")
    .replace(projectAction, "\n")
    .replace(/\)\s+(?=\[(?:DONE|WIP|IN PROGRESS|BLOCKED|COMPLETED)\])/gi, ") ")
    .replace(/[ \t]{2,}(?=\d+(?:\.\d+)?\s*(?:hours?|hrs?|h|minutes?|mins?|m)(?![a-z]))/gi, " ")
    .replace(/[ \t]{2,}/g, "\n");

  const lines: LogicalLine[] = [];
  let startsBlock = true;
  for (const line of normalized.split(/\r?\n/)) {
    if (!line.trim()) {
      startsBlock = true;
      continue;
    }
    lines.push({
      value: line.replace(/^\s*(?:[-*]|\d+[.)])\s+/, "").trim(),
      isBullet: /^\s*(?:[-*]|\d+[.)])\s+/.test(line),
      startsBlock
    });
    startsBlock = false;
  }
  return lines;
}

function inlineProjectAndTask(value: string) {
  const match = value.match(new RegExp(`^(.{1,50}?)\\s+((?:(?:${ACTION_WORDS})\\b|[A-Z]{2,}-\\d+\\b).*)$`, "i"));
  if (!match) return null;
  const project = match[1].replace(/:$/, "").trim();
  const projectStartsWithAction = new RegExp(`^(?:${ACTION_WORDS})\\b`, "i").test(project);
  return project.split(/\s+/).length <= 4 && !projectStartsWithAction ? { project, task: match[2].trim() } : null;
}

function isProjectHeading(value: string, nextLine?: LogicalLine) {
  const withoutMarker = value.replace(STATUS_MARKER, "").trim();
  if (extractUrl(withoutMarker) || parseDuration(withoutMarker) !== null) return false;
  if (/:$/.test(withoutMarker)) return true;
  const words = withoutMarker.split(/\s+/);
  return words.length <= 4
    && !/[.!?]$/.test(withoutMarker)
    && Boolean(nextLine && (parseDuration(nextLine.value) !== null || nextLine.isBullet));
}

function isProjectWithTaskHeading(value: string, nextLine?: LogicalLine, followingLine?: LogicalLine) {
  if (!nextLine || nextLine.isBullet) return false;
  if (!HAS_STATUS_MARKER.test(nextLine.value) && !followingLine?.isBullet && parseDuration(nextLine.value) === null) return false;

  const project = value.replace(STATUS_MARKER, "").replace(/:$/, "").trim();
  const task = nextLine.value.replace(STATUS_MARKER, "").trim();
  if (!project || !task || extractUrl(project) || parseDuration(project) !== null) return false;

  const words = project.split(/\s+/);
  return words.length <= 4
    && !/[.!?]$/.test(project)
    && !new RegExp(`^(?:${ACTION_WORDS})\\b`, "i").test(project);
}

function parseTodaySection(section: string) {
  const lines = logicalLines(section);
  const tasks: ParsedStatusTask[] = [];
  let projectName: string | null = null;
  let groupedTask: ParsedStatusTask | null = null;

  function addTask(description: string, line: string) {
    const task: ParsedStatusTask = {
      period: ReportPeriod.TODAY,
      projectName,
      description,
      details: null,
      durationMinutes: parseDuration(line),
      taskUrl: extractUrl(line),
      sortOrder: tasks.length
    };
    tasks.push(task);
    return task;
  }

  for (let index = 0; index < lines.length; index += 1) {
    const logicalLine = lines[index];
    let line = logicalLine.value;

    if (/^task\s*:/i.test(line)) {
      const lastTask = tasks.at(-1);
      if (lastTask) lastTask.taskUrl = extractUrl(line);
      continue;
    }

    if (!logicalLine.isBullet && isProjectWithTaskHeading(line, lines[index + 1], lines[index + 2])) {
      projectName = line.replace(STATUS_MARKER, "").replace(/:$/, "").trim();
      groupedTask = null;
      continue;
    }

    const headingLink = line.replace(STATUS_MARKER, "").trim().match(/^(.{1,80}?)\s+\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)\s*$/i);
    if (!logicalLine.isBullet && headingLink && parseDuration(line) === null) {
      projectName = headingLink[1].replace(/:$/, "").trim();
      groupedTask = addTask(headingLink[2].trim(), line);
      groupedTask.taskUrl = headingLink[3];
      continue;
    }

    if (
      !logicalLine.isBullet
      && projectName
      && (HAS_STATUS_MARKER.test(line) || parseDuration(line) !== null)
    ) {
      const description = cleanDescription(line);
      if (description) groupedTask = addTask(description, line);
      continue;
    }

    if (logicalLine.isBullet && groupedTask) {
      const detail = cleanDetail(line);
      if (detail) groupedTask.details = groupedTask.details ? `${groupedTask.details}\n${detail}` : detail;
      const detailMinutes = parseDuration(line);
      if (detailMinutes !== null) groupedTask.durationMinutes = (groupedTask.durationMinutes ?? 0) + detailMinutes;
      if (!groupedTask.taskUrl) groupedTask.taskUrl = extractUrl(line);
      continue;
    }

    if (!logicalLine.isBullet && groupedTask && !logicalLine.startsBlock) {
      const detail = cleanDetail(line);
      if (detail) groupedTask.details = groupedTask.details ? `${groupedTask.details}\n${detail}` : detail;
      if (!groupedTask.taskUrl) groupedTask.taskUrl = extractUrl(line);
      continue;
    }

    if (!logicalLine.isBullet && projectName && lines[index + 1]?.isBullet && !/:\s*$/.test(line)) {
      const description = cleanDescription(line);
      if (description) groupedTask = addTask(description, line);
      continue;
    }

    const inline = inlineProjectAndTask(line);
    if (inline) {
      projectName = inline.project;
      groupedTask = null;
      line = inline.task;
    } else if (!logicalLine.isBullet && isProjectHeading(line, lines[index + 1])) {
      projectName = line.replace(STATUS_MARKER, "").replace(/:$/, "").trim();
      groupedTask = null;
      continue;
    }

    const description = cleanDescription(line);
    if (!description) {
      const lastTask = tasks.at(-1);
      const taskUrl = extractUrl(line);
      if (lastTask && taskUrl) lastTask.taskUrl = taskUrl;
      continue;
    }

    addTask(description, line);
    groupedTask = null;
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
