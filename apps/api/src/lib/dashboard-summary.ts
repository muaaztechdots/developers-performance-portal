export type DashboardDeveloperInput = {
  id: string;
  jobTitle: string | null;
  specialty: "ENGINEERING" | "QA";
  user: {
    firstName: string;
    lastName: string;
  };
  statusReports: Array<{
    reportDate: Date | string;
    tasks: Array<{
      durationMinutes: number | null;
      projectName: string | null;
      project: { id: string; name: string } | null;
    }>;
  }>;
};

export type DashboardSummary = ReturnType<typeof buildDashboardSummary>;

function dateKey(value: Date | string) {
  return new Date(value).toISOString().slice(0, 10);
}

function isWeekend(date: string) {
  const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return day === 0 || day === 6;
}

function percentage(submitted: number, expected: number) {
  return expected > 0 ? Math.round((submitted / expected) * 100) : 0;
}

export function yesterdayInTimeZone(timeZone = "Asia/Karachi", now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric"
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  const yesterday = new Date(Date.UTC(value("year"), value("month") - 1, value("day")));
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  return yesterday;
}

export function sevenDayWindow(endDate: Date) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(endDate);
    date.setUTCDate(date.getUTCDate() - (6 - index));
    return date.toISOString().slice(0, 10);
  });
}

export function buildDashboardSummary(developers: DashboardDeveloperInput[], yesterdayDate: Date) {
  const yesterday = yesterdayDate.toISOString().slice(0, 10);
  const dates = sevenDayWindow(yesterdayDate);
  const teamTotal = developers.length;
  const dayMetrics = new Map(dates.map((date) => [date, {
    date,
    isWeekend: isWeekend(date),
    submitted: 0,
    missing: 0,
    coveragePercent: null as number | null,
    taskCount: 0,
    reportedMinutes: 0
  }]));
  const projects = new Map<string, { id: string | null; name: string; taskCount: number; reportedMinutes: number }>();

  for (const developer of developers) {
    const submittedDates = new Set<string>();
    for (const report of developer.statusReports) {
      const reportDate = dateKey(report.reportDate);
      const metrics = dayMetrics.get(reportDate);
      if (!metrics) continue;

      if (!submittedDates.has(reportDate)) {
        submittedDates.add(reportDate);
        metrics.submitted += 1;
      }
      metrics.taskCount += report.tasks.length;

      for (const task of report.tasks) {
        metrics.reportedMinutes += task.durationMinutes ?? 0;
        const projectName = task.project?.name ?? task.projectName;
        if (!projectName) continue;
        const projectKey = task.project?.id ?? projectName.trim().toLowerCase();
        const project = projects.get(projectKey) ?? {
          id: task.project?.id ?? null,
          name: projectName,
          taskCount: 0,
          reportedMinutes: 0
        };
        project.taskCount += 1;
        project.reportedMinutes += task.durationMinutes ?? 0;
        projects.set(projectKey, project);
      }
    }
  }

  const recentDays = [...dayMetrics.values()].map((day) => {
    if (day.isWeekend) return day;
    return {
      ...day,
      missing: Math.max(teamTotal - day.submitted, 0),
      coveragePercent: percentage(day.submitted, teamTotal)
    };
  });
  const yesterdayMetrics = recentDays.find((day) => day.date === yesterday)!;
  const developerStatuses = developers.map((developer) => {
    const report = developer.statusReports.find((item) => dateKey(item.reportDate) === yesterday);
    const reportedMinutes = report?.tasks.reduce((total, task) => total + (task.durationMinutes ?? 0), 0) ?? 0;
    return {
      id: developer.id,
      name: `${developer.user.firstName} ${developer.user.lastName}`.trim(),
      jobTitle: developer.jobTitle,
      specialty: developer.specialty,
      submitted: Boolean(report),
      taskCount: report?.tasks.length ?? 0,
      reportedMinutes
    };
  }).sort((left, right) => Number(left.submitted) - Number(right.submitted) || left.name.localeCompare(right.name));

  return {
    yesterdayDate: yesterday,
    yesterdayIsWeekend: yesterdayMetrics.isWeekend,
    team: {
      total: teamTotal,
      engineering: developers.filter((developer) => developer.specialty === "ENGINEERING").length,
      qa: developers.filter((developer) => developer.specialty === "QA").length
    },
    yesterday: {
      submitted: yesterdayMetrics.submitted,
      missing: yesterdayMetrics.missing,
      coveragePercent: yesterdayMetrics.coveragePercent,
      taskCount: yesterdayMetrics.taskCount,
      reportedMinutes: yesterdayMetrics.reportedMinutes
    },
    recentDays,
    developerStatuses,
    projectActivity: [...projects.values()]
      .sort((left, right) => right.taskCount - left.taskCount || right.reportedMinutes - left.reportedMinutes || left.name.localeCompare(right.name))
      .slice(0, 6)
  };
}
