import { todayInPakistan } from "./developer-calendar";

export const STATUS_AUTO_SYNC_KEY = "developer-status-auto-sync-date";
export const STATUS_SYNC_JOB_IDS_KEY = "developer-status-sync-job-ids";

export function currentStatusSyncDate() {
  return todayInPakistan();
}

export function readStoredStatusJobIds() {
  try {
    const value = JSON.parse(sessionStorage.getItem(STATUS_SYNC_JOB_IDS_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function storeStatusJobIds(jobIds: string[]) {
  if (jobIds.length) sessionStorage.setItem(STATUS_SYNC_JOB_IDS_KEY, JSON.stringify(jobIds));
  else sessionStorage.removeItem(STATUS_SYNC_JOB_IDS_KEY);
}
