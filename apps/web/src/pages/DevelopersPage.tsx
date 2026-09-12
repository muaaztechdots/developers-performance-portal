import { AlertCircle, CheckCircle2, CircleDashed, RefreshCw, Search, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import type { Developer, DeveloperStatusSyncJob } from "../types";

const AUTO_SYNC_KEY = "developer-status-auto-sync-date";
const ACTIVE_JOB_IDS_KEY = "developer-status-sync-job-ids";
const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function pakistanDateKey() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function readStoredJobIds() {
  try {
    const value = JSON.parse(sessionStorage.getItem(ACTIVE_JOB_IDS_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function DevelopersPage() {
  const { user } = useAuth();
  const [developers, setDevelopers] = useState<Developer[]>([]);
  const [yesterdayDate, setYesterdayDate] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncJobs, setSyncJobs] = useState<DeveloperStatusSyncJob[]>([]);
  const [syncNotice, setSyncNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const mountedRef = useRef(false);
  const monitoringRef = useRef(false);

  const loadDevelopers = useCallback(async () => {
    const result = await api.developers();
    if (mountedRef.current) {
      setDevelopers(result.developers);
      setYesterdayDate(result.yesterdayDate);
    }
    return result;
  }, []);

  const monitorJobs = useCallback(async (initialJobs: DeveloperStatusSyncJob[]) => {
    if (monitoringRef.current || initialJobs.length === 0) return;
    monitoringRef.current = true;
    if (mountedRef.current) {
      setSyncing(true);
      setSyncJobs(initialJobs);
    }

    let jobs = initialJobs;
    let previousFinished = jobs.filter((job) => job.status === "COMPLETED" || job.status === "FAILED").length;
    try {
      while (mountedRef.current && jobs.some((job) => job.status === "PENDING" || job.status === "RUNNING")) {
        await wait(1_000);
        if (!mountedRef.current) return;
        ({ jobs } = await api.discordStatusSyncProgress(jobs.map((job) => job.id)));
        if (!mountedRef.current) return;
        setSyncJobs(jobs);

        const finished = jobs.filter((job) => job.status === "COMPLETED" || job.status === "FAILED").length;
        if (finished > previousFinished) {
          previousFinished = finished;
          await loadDevelopers();
        }
      }

      if (!mountedRef.current) return;
      sessionStorage.removeItem(ACTIVE_JOB_IDS_KEY);
      await loadDevelopers();
      const failed = jobs.filter((job) => job.status === "FAILED").length;
      const importedTasks = jobs.reduce((total, job) => total + job.importedTasks, 0);
      setSyncNotice({
        type: failed ? "error" : "success",
        message: failed
          ? `Status sync finished with ${failed} failed developer${failed === 1 ? "" : "s"}. ${importedTasks} tasks were imported.`
          : `All ${jobs.length} developer statuses are synced. ${importedTasks} tasks were imported.`
      });
    } catch (error) {
      if (mountedRef.current) {
        setSyncNotice({ type: "error", message: error instanceof Error ? error.message : "Status sync failed." });
      }
    } finally {
      monitoringRef.current = false;
      if (mountedRef.current) setSyncing(false);
    }
  }, [loadDevelopers]);

  const syncAllStatuses = useCallback(async () => {
    if (monitoringRef.current) return;
    if (mountedRef.current) {
      setSyncing(true);
      setSyncNotice(null);
    }
    try {
      const { jobs } = await api.syncAllDiscordStatuses();
      if (jobs.length) sessionStorage.setItem(ACTIVE_JOB_IDS_KEY, JSON.stringify(jobs.map((job) => job.id)));
      if (!mountedRef.current) return;
      await loadDevelopers();
      if (jobs.length === 0) {
        setSyncing(false);
        setSyncNotice({ type: "error", message: "No developers are linked to Discord threads." });
        return;
      }
      await monitorJobs(jobs);
    } catch (error) {
      if (mountedRef.current) {
        setSyncing(false);
        setSyncNotice({ type: "error", message: error instanceof Error ? error.message : "Discord status sync failed." });
      }
    }
  }, [loadDevelopers, monitorJobs]);

  useEffect(() => {
    mountedRef.current = true;
    const initialize = async () => {
      try {
        await loadDevelopers();
      } catch {
        if (mountedRef.current) setDevelopers([]);
      } finally {
        if (mountedRef.current) setLoading(false);
      }
      if (!mountedRef.current || user?.role !== "ADMIN") return;

      const storedIds = readStoredJobIds();
      if (storedIds.length) {
        try {
          const { jobs } = await api.discordStatusSyncProgress(storedIds);
          if (jobs.some((job) => job.status === "PENDING" || job.status === "RUNNING")) {
            await monitorJobs(jobs);
            return;
          }
          sessionStorage.removeItem(ACTIVE_JOB_IDS_KEY);
        } catch {
          sessionStorage.removeItem(ACTIVE_JOB_IDS_KEY);
        }
      }

      const today = pakistanDateKey();
      if (sessionStorage.getItem(AUTO_SYNC_KEY) !== today) {
        sessionStorage.setItem(AUTO_SYNC_KEY, today);
        await syncAllStatuses();
      }
    };
    void initialize();
    return () => { mountedRef.current = false; };
  }, [loadDevelopers, monitorJobs, syncAllStatuses, user?.role]);

  const filtered = useMemo(() => developers.filter((developer) =>
    `${developer.user.firstName} ${developer.user.lastName} ${developer.user.email}`.toLowerCase().includes(query.toLowerCase())
  ), [developers, query]);
  const finishedJobs = syncJobs.filter((job) => job.status === "COMPLETED" || job.status === "FAILED").length;
  const failedJobs = syncJobs.filter((job) => job.status === "FAILED").length;
  const currentJob = syncJobs.find((job) => job.status === "RUNNING") ?? syncJobs.find((job) => job.status === "PENDING");
  const progressPercent = syncJobs.length ? Math.round((finishedJobs / syncJobs.length) * 100) : 0;

  return (
    <div className="developers-page page-stack">
      <section className="page-heading">
        <div><p className="welcome-line">Your engineering team</p><p>Yesterday&apos;s status coverage and Discord activity sync.</p></div>
        {user?.role === "ADMIN" && <button className="primary-button compact" disabled={syncing} onClick={() => void syncAllStatuses()}><RefreshCw className={syncing ? "is-spinning" : ""} size={18} />{syncing ? "Syncing statuses…" : "Sync all statuses"}</button>}
      </section>

      {syncJobs.length > 0 && <section className="panel status-sync-progress" aria-live="polite">
        <header><div><span className="sync-progress-icon"><RefreshCw className={syncing ? "is-spinning" : ""} size={18} /></span><div><h2>{syncing ? "Syncing Discord statuses" : "Latest status sync"}</h2><p>{currentJob ? `${currentJob.status === "RUNNING" ? "Reading" : "Waiting for"} ${currentJob.developer.user.firstName} ${currentJob.developer.user.lastName}` : "All queued developers processed"}</p></div></div><strong>{finishedJobs}/{syncJobs.length}</strong></header>
        <div className="sync-progress-track"><span style={{ width: `${progressPercent}%` }} /></div>
        <div className="sync-progress-summary"><span>{progressPercent}% complete</span><span>{currentJob?.processedMessages ?? 0} messages read for current developer</span><span>{failedJobs} failed</span></div>
        <div className="sync-developer-steps">
          {syncJobs.map((job) => <div className={`sync-developer-step ${job.status.toLowerCase()}`} key={job.id} title={job.error ?? undefined}>
            {job.status === "COMPLETED" ? <CheckCircle2 size={15} /> : job.status === "FAILED" ? <AlertCircle size={15} /> : <CircleDashed className={job.status === "RUNNING" ? "is-spinning" : ""} size={15} />}
            <span>{job.developer.user.firstName} {job.developer.user.lastName}</span>
            <small>{job.status === "RUNNING" ? `${job.processedMessages} messages` : job.status.toLowerCase()}</small>
          </div>)}
        </div>
      </section>}

      {syncNotice && <div className={`sync-notice ${syncNotice.type}`} role="status">{syncNotice.type === "success" ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}<span>{syncNotice.message}</span><button type="button" aria-label="Dismiss sync message" onClick={() => setSyncNotice(null)}>×</button></div>}

      <section className="panel directory-panel">
        <div className="directory-tools"><div><h2>All developers</h2><p>{developers.length} team member{developers.length === 1 ? "" : "s"}{yesterdayDate ? ` · Status date ${yesterdayDate}` : ""}</p></div><label className="search-box directory-search"><Search size={17} /><input placeholder="Search developers" value={query} onChange={(event) => setQuery(event.target.value)} /></label></div>
        {loading ? (
          <div className="empty-state"><div className="empty-icon"><Users size={24} /></div><h3>Loading your team…</h3></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state"><div className="empty-icon"><Users size={24} /></div><h3>{query ? "No matches found" : "No developers yet"}</h3><p>{query ? "Try a different name or email." : "No Discord developers have been synchronized yet."}</p></div>
        ) : (
          <div className="developer-list">
            {filtered.map((developer) => <div className="developer-row" key={developer.id}>
              <Link className="developer-row-task-link" to={`/developers/${developer.id}`} aria-label={`View ${developer.user.firstName} ${developer.user.lastName}'s task history`} />
              <span className="avatar">{developer.user.firstName[0]}{developer.user.lastName[0]}</span>
              <div className="developer-identity"><Link className="developer-name-link" to={`/developers/${developer.id}/edit`} title="Edit developer information"><strong>{developer.user.firstName} {developer.user.lastName}</strong></Link><small>{developer.user.email}</small></div>
              <span>{developer.jobTitle ?? "Developer"}</span>
              <span>{developer._count.statusReports} updates</span>
              <span className={`yesterday-status ${developer.yesterdayStatusSubmitted ? "submitted" : "missing"}`}>{developer.yesterdayStatusSubmitted ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}{developer.yesterdayStatusSubmitted ? "Yesterday received" : "Yesterday missing"}</span>
            </div>)}
          </div>
        )}
      </section>
    </div>
  );
}
