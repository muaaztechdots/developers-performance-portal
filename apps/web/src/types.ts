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
  state: "NOT_CLICKUP" | "NOT_CONFIGURED" | "UNAVAILABLE" | "AVAILABLE";
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
