import type { ProjectDetail } from "../types";

export type ProjectTask = ProjectDetail["tasks"][number];

export type ProjectTaskGroup = {
  key: string;
  description: string;
  totalMinutes: number;
  timedEntryCount: number;
  latestDate: string;
  contributors: Array<{ id: string; name: string }>;
  entries: ProjectTask[];
};

function taskKey(description: string) {
  return description.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function groupProjectTasks(tasks: ProjectTask[]) {
  const groups = new Map<string, ProjectTaskGroup & { contributorMap: Map<string, string> }>();

  for (const task of tasks) {
    const key = taskKey(task.description);
    const developer = task.statusReport.developer;
    const developerName = `${developer.user.firstName} ${developer.user.lastName}`.trim();
    const existing = groups.get(key) ?? {
      key,
      description: task.description.trim(),
      totalMinutes: 0,
      timedEntryCount: 0,
      latestDate: task.statusReport.reportDate,
      contributorMap: new Map<string, string>(),
      contributors: [],
      entries: []
    };

    existing.entries.push(task);
    existing.totalMinutes += task.durationMinutes ?? 0;
    if (task.durationMinutes !== null) existing.timedEntryCount += 1;
    if (task.statusReport.reportDate > existing.latestDate) existing.latestDate = task.statusReport.reportDate;
    existing.contributorMap.set(developer.id, developerName);
    groups.set(key, existing);
  }

  return [...groups.values()]
    .map(({ contributorMap, ...group }) => ({
      ...group,
      contributors: [...contributorMap].map(([id, name]) => ({ id, name }))
    }))
    .sort((left, right) => right.totalMinutes - left.totalMinutes
      || right.entries.length - left.entries.length
      || left.description.localeCompare(right.description));
}
