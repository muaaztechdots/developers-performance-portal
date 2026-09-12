export type User = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: "ADMIN" | "DEVELOPER";
  developer: null | {
    id: string;
    jobTitle: string | null;
    department: string | null;
  };
};

export type Developer = {
  id: string;
  jobTitle: string | null;
  department: string | null;
  timezone: string;
  specialty: "ENGINEERING" | "QA";
  discordThreadId: string | null;
  discordThreadName: string | null;
  yesterdayStatusSubmitted?: boolean;
  user: {
    email: string;
    firstName: string;
    lastName: string;
    isActive: boolean;
  };
  _count: { statusReports: number };
};

export type UpdateDeveloperInput = {
  email: string;
  firstName: string;
  lastName: string;
  jobTitle: string;
  department: string;
  timezone: string;
  specialty: "ENGINEERING" | "QA";
  isActive: boolean;
};

export type DeveloperProfile = Omit<Developer, "_count" | "yesterdayStatusSubmitted">;

export type Project = {
  id: string;
  name: string;
  normalizedName: string;
  aliases: Array<{
    id: string;
    name: string;
    normalizedName: string;
  }>;
  createdAt: string;
  updatedAt: string;
  _count: { tasks: number };
};

export type ProjectInput = {
  name: string;
  aliases: string[];
};

export type PerformanceReport = {
  filters: {
    developerId: string | null;
    mode: "date" | "month" | "range";
    date: string | null;
    month: string | null;
    from: string;
    to: string;
  };
  stats: {
    statusDays: number;
    taskCount: number;
    totalMinutes: number;
    averageMinutesPerStatusDay: number;
    linkedTickets: number;
    assignedTasks: number;
    timedTasks: number;
    ticketCoveragePercent: number | null;
    projectCoveragePercent: number | null;
    timeCoveragePercent: number | null;
  };
  dailyActivity: Array<{
    date: string;
    taskCount: number;
    reportedMinutes: number;
    developersReported: number;
  }>;
  projectBreakdown: Array<{
    id: string | null;
    name: string;
    taskCount: number;
    reportedMinutes: number;
  }>;
  developerBreakdown: Array<{
    id: string;
    name: string;
    specialty: "ENGINEERING" | "QA";
    statusDays: number;
    taskCount: number;
    reportedMinutes: number;
    linkedTickets: number;
  }>;
  tasks: Array<{
    id: string;
    date: string;
    description: string;
    durationMinutes: number | null;
    taskUrl: string | null;
    projectName: string | null;
    project: { id: string; name: string } | null;
    developer: { id: string; name: string };
  }>;
};

export type DashboardSummary = {
  yesterdayDate: string;
  yesterdayIsWeekend: boolean;
  team: {
    total: number;
    engineering: number;
    qa: number;
  };
  yesterday: {
    submitted: number;
    missing: number;
    coveragePercent: number | null;
    taskCount: number;
    reportedMinutes: number;
  };
  recentDays: Array<{
    date: string;
    isWeekend: boolean;
    submitted: number;
    missing: number;
    coveragePercent: number | null;
    taskCount: number;
    reportedMinutes: number;
  }>;
  developerStatuses: Array<{
    id: string;
    name: string;
    jobTitle: string | null;
    specialty: "ENGINEERING" | "QA";
    submitted: boolean;
    taskCount: number;
    reportedMinutes: number;
  }>;
  projectActivity: Array<{
    id: string | null;
    name: string;
    taskCount: number;
    reportedMinutes: number;
  }>;
};

export type DiscordSyncJob = {
  id: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  processedMessages: number;
  importedReports: number;
  importedTasks: number;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

export type DeveloperStatusSyncJob = DiscordSyncJob & {
  developerId: string;
  developer: {
    id: string;
    user: { firstName: string; lastName: string };
  };
};

export type DeveloperDetail = Omit<Developer, "_count"> & {
  statusReports: Array<{
    id: string;
    reportDate: string;
    source: "MANUAL" | "DISCORD";
    tasks: Array<{
      id: string;
      description: string;
      durationMinutes: number | null;
      taskUrl: string | null;
      clickUpUrl: string | null;
      pullRequestUrl: string | null;
      pullRequestState: "FOUND" | "MISSING" | "PENDING" | "NOT_APPLICABLE";
      projectName: string | null;
      project: { id: string; name: string } | null;
    }>;
  }>;
  syncJobs: DiscordSyncJob[];
};

export type TaskDetail = {
  id: string;
  description: string;
  durationMinutes: number | null;
  taskUrl: string | null;
  projectName: string | null;
  project: { id: string; name: string } | null;
  statusReport: {
    reportDate: string;
    developer: {
      id: string;
      user: { firstName: string; lastName: string };
    };
  };
};

export type ClickUpEnrichment = {
  state: "NOT_CLICKUP" | "NOT_CONFIGURED" | "PENDING" | "UNAVAILABLE" | "AVAILABLE";
  ticket: null | {
    id: string;
    title: string;
    description: string | null;
    url: string;
  };
  comments: Array<{
    id: string;
    text: string;
    author: string;
    authorAvatar: string | null;
    createdAt: string | null;
  }>;
};
