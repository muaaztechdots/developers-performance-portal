import type { ClickUpEnrichment, DashboardSummary, Developer, DeveloperDetail, DeveloperProfile, DeveloperStatusSyncJob, DiscordSyncJob, Project, ProjectInput, TaskDetail, UpdateDeveloperInput, User } from "../types";

export type DiscordDeveloperSyncResult = {
  threadsScanned: number;
  developersCreated: number;
  developersLinked: number;
  developersUnchanged: number;
  errors: string[];
};

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options?.headers }
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: "Request failed." }));
    throw new Error(body.message ?? "Request failed.");
  }

  return response.status === 204 ? (undefined as T) : response.json();
}

export const api = {
  login: (email: string, password: string) =>
    request<{ user: User }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    }),
  me: () => request<{ user: User }>("/auth/me"),
  logout: () => request<void>("/auth/logout", { method: "POST" }),
  dashboardSummary: () => request<{ summary: DashboardSummary }>("/dashboard/summary"),
  developers: () => request<{ developers: Developer[]; yesterdayDate: string }>("/developers"),
  developer: (id: string) => request<{ developer: DeveloperDetail }>(`/developers/${id}`),
  updateDeveloper: (id: string, input: UpdateDeveloperInput) => request<{ developer: DeveloperProfile }>(`/developers/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  }),
  projects: () => request<{ projects: Project[] }>("/projects"),
  project: (id: string) => request<{ project: Project }>(`/projects/${id}`),
  createProject: (input: ProjectInput) => request<{ project: Project }>("/projects", {
    method: "POST",
    body: JSON.stringify(input)
  }),
  updateProject: (id: string, input: ProjectInput) => request<{ project: Project }>(`/projects/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  }),
  syncDeveloperTasks: (id: string) => request<{ job: DiscordSyncJob }>(`/developers/${id}/sync-tasks`, { method: "POST" }),
  developerSyncJob: (developerId: string, jobId: string) => request<{ job: DiscordSyncJob }>(`/developers/${developerId}/sync-jobs/${jobId}`),
  task: (id: string) => request<{ task: TaskDetail; clickup: ClickUpEnrichment }>(`/tasks/${id}`),
  assignTaskProject: (id: string, projectId: string | null) => request<{ task: Pick<TaskDetail, "id" | "projectName" | "project"> }>(`/tasks/${id}/project`, {
    method: "PATCH",
    body: JSON.stringify({ projectId })
  }),
  syncDiscordDevelopers: () => request<{ result: DiscordDeveloperSyncResult }>("/integrations/discord/sync-developers", { method: "POST" }),
  syncAllDiscordStatuses: () => request<{ jobs: DeveloperStatusSyncJob[]; developerSync: DiscordDeveloperSyncResult }>("/integrations/discord/sync-statuses", { method: "POST" }),
  discordStatusSyncProgress: (jobIds: string[]) => request<{ jobs: DeveloperStatusSyncJob[] }>(`/integrations/discord/sync-statuses/progress?jobIds=${encodeURIComponent(jobIds.join(","))}`)
};
