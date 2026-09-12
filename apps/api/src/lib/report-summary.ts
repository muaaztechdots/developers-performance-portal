type ReportTask = {
  id: string;
  description: string;
  durationMinutes: number | null;
  taskUrl: string | null;
  projectName: string | null;
  project: { id: string; name: string } | null;
};

export type PerformanceReportRow = {
  id: string;
  reportDate: Date;
  developer: {
    id: string;
    specialty: "ENGINEERING" | "QA";
    user: { firstName: string; lastName: string };
  };
  tasks: ReportTask[];
};

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function percentage(part: number, total: number) {
  return total ? Math.round((part / total) * 100) : null;
}

function dateRange(from: Date, to: Date) {
  const dates: string[] = [];
  const cursor = new Date(from);
  while (cursor <= to) {
    dates.push(isoDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

export function buildPerformanceReport(rows: PerformanceReportRow[], from: Date, to: Date) {
  const dailyActivity = new Map(dateRange(from, to).map((date) => [date, {
    date,
    taskCount: 0,
    reportedMinutes: 0,
    developerIds: new Set<string>()
  }]));
  const projectBreakdown = new Map<string, {
    id: string | null;
    name: string;
    taskCount: number;
    reportedMinutes: number;
  }>();
  const developerBreakdown = new Map<string, {
    id: string;
    name: string;
    specialty: "ENGINEERING" | "QA";
    statusDays: number;
    taskCount: number;
    reportedMinutes: number;
    linkedTickets: number;
  }>();
  const tasks: Array<ReportTask & {
    date: string;
    developer: { id: string; name: string };
  }> = [];
  let totalMinutes = 0;
  let linkedTickets = 0;
  let assignedTasks = 0;
  let timedTasks = 0;

  for (const row of rows) {
    const date = isoDate(row.reportDate);
    const developerName = `${row.developer.user.firstName} ${row.developer.user.lastName}`.trim();
    const developer = developerBreakdown.get(row.developer.id) ?? {
      id: row.developer.id,
      name: developerName,
      specialty: row.developer.specialty,
      statusDays: 0,
      taskCount: 0,
      reportedMinutes: 0,
      linkedTickets: 0
    };
    developer.statusDays += 1;
    dailyActivity.get(date)?.developerIds.add(row.developer.id);

    for (const task of row.tasks) {
      const minutes = task.durationMinutes ?? 0;
      const projectId = task.project?.id ?? null;
      const projectName = task.project?.name ?? task.projectName ?? "Unassigned";
      const projectKey = projectId ?? "unassigned";
      const project = projectBreakdown.get(projectKey) ?? {
        id: projectId,
        name: projectName,
        taskCount: 0,
        reportedMinutes: 0
      };

      project.taskCount += 1;
      project.reportedMinutes += minutes;
      projectBreakdown.set(projectKey, project);
      developer.taskCount += 1;
      developer.reportedMinutes += minutes;
      if (task.taskUrl) {
        linkedTickets += 1;
        developer.linkedTickets += 1;
      }
      if (task.project) assignedTasks += 1;
      if (task.durationMinutes !== null) timedTasks += 1;
      totalMinutes += minutes;

      const day = dailyActivity.get(date);
      if (day) {
        day.taskCount += 1;
        day.reportedMinutes += minutes;
      }
      tasks.push({ ...task, date, developer: { id: row.developer.id, name: developerName } });
    }
    developerBreakdown.set(row.developer.id, developer);
  }

  const taskCount = tasks.length;
  return {
    stats: {
      statusDays: rows.length,
      taskCount,
      totalMinutes,
      averageMinutesPerStatusDay: rows.length ? Math.round(totalMinutes / rows.length) : 0,
      linkedTickets,
      assignedTasks,
      timedTasks,
      ticketCoveragePercent: percentage(linkedTickets, taskCount),
      projectCoveragePercent: percentage(assignedTasks, taskCount),
      timeCoveragePercent: percentage(timedTasks, taskCount)
    },
    dailyActivity: [...dailyActivity.values()].map(({ developerIds, ...day }) => ({
      ...day,
      developersReported: developerIds.size
    })),
    projectBreakdown: [...projectBreakdown.values()].sort((left, right) =>
      right.reportedMinutes - left.reportedMinutes || right.taskCount - left.taskCount || left.name.localeCompare(right.name)
    ),
    developerBreakdown: [...developerBreakdown.values()].sort((left, right) =>
      right.reportedMinutes - left.reportedMinutes || left.name.localeCompare(right.name)
    ),
    tasks: tasks.sort((left, right) => right.date.localeCompare(left.date) || left.description.localeCompare(right.description))
  };
}
