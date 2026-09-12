import { AlertCircle, BarChart3, CalendarDays, CheckCircle2, ChevronRight, Clock3, FolderKanban, RefreshCw, Users } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { currentStatusSyncDate, readStoredStatusJobIds, STATUS_AUTO_SYNC_KEY, STATUS_SYNC_JOB_IDS_KEY, storeStatusJobIds } from "../lib/status-sync-session";
import type { DashboardSummary, DeveloperStatusSyncJob } from "../types";

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function durationLabel(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!hours) return `${remainder}m`;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function dateLabel(value: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }).format(new Date(`${value}T00:00:00.000Z`));
}

export function DashboardPage() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncingStatuses, setSyncingStatuses] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(false);
  const backgroundSyncRef = useRef(false);
  const today = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(new Date());

  const loadSummary = useCallback(async (showLoading = false) => {
    if (showLoading && mountedRef.current) {
      setLoading(true);
      setError(null);
    }
    try {
      const result = await api.dashboardSummary();
      if (mountedRef.current) setSummary(result.summary);
    } catch (loadError) {
      if (showLoading && mountedRef.current) {
        setError(loadError instanceof Error ? loadError.message : "Could not load dashboard data.");
      }
    } finally {
      if (showLoading && mountedRef.current) setLoading(false);
    }
  }, []);

  const monitorStatusJobs = useCallback(async (initialJobs: DeveloperStatusSyncJob[]) => {
    let jobs = initialJobs;
    while (mountedRef.current && jobs.some((job) => job.status === "PENDING" || job.status === "RUNNING")) {
      await wait(1_000);
      if (!mountedRef.current) return;
      ({ jobs } = await api.discordStatusSyncProgress(jobs.map((job) => job.id)));
    }
    if (!mountedRef.current) return;
    sessionStorage.removeItem(STATUS_SYNC_JOB_IDS_KEY);
    await loadSummary(false);
  }, [loadSummary]);

  const refreshStatusesInBackground = useCallback(async (force = false) => {
    if (backgroundSyncRef.current || user?.role !== "ADMIN") return;
    backgroundSyncRef.current = true;
    if (mountedRef.current) setSyncingStatuses(true);
    try {
      const storedJobIds = readStoredStatusJobIds();
      if (storedJobIds.length) {
        try {
          const { jobs } = await api.discordStatusSyncProgress(storedJobIds);
          if (jobs.some((job) => job.status === "PENDING" || job.status === "RUNNING")) {
            await monitorStatusJobs(jobs);
            return;
          }
          sessionStorage.removeItem(STATUS_SYNC_JOB_IDS_KEY);
          await loadSummary(false);
        } catch {
          sessionStorage.removeItem(STATUS_SYNC_JOB_IDS_KEY);
        }
      }

      const syncDate = currentStatusSyncDate();
      if (!force && sessionStorage.getItem(STATUS_AUTO_SYNC_KEY) === syncDate) return;
      sessionStorage.setItem(STATUS_AUTO_SYNC_KEY, syncDate);

      try {
        const { jobs } = await api.syncAllDiscordStatuses();
        storeStatusJobIds(jobs.map((job) => job.id));
        if (jobs.length) await monitorStatusJobs(jobs);
        else await loadSummary(false);
      } catch {
        sessionStorage.removeItem(STATUS_AUTO_SYNC_KEY);
      }
    } finally {
      backgroundSyncRef.current = false;
      if (mountedRef.current) setSyncingStatuses(false);
    }
  }, [loadSummary, monitorStatusJobs, user?.role]);

  useEffect(() => {
    mountedRef.current = true;
    const initialize = async () => {
      await loadSummary(true);
      if (mountedRef.current) await refreshStatusesInBackground();
    };
    void initialize();
    return () => { mountedRef.current = false; };
  }, [loadSummary, refreshStatusesInBackground]);

  if (loading) return <div className="dashboard-loading empty-state"><div className="loading-mark" /><h3>Loading team status dashboard…</h3></div>;
  if (!summary) return <div className="dashboard-loading empty-state"><AlertCircle size={28} /><h3>Dashboard unavailable</h3><p>{error}</p><button className="secondary-button compact" onClick={() => void loadSummary(true)}><RefreshCw size={16} />Try again</button></div>;

  const yesterdayLabel = dateLabel(summary.yesterdayDate, { weekday: "long", month: "long", day: "numeric" });
  const cards = [
    {
      label: "Active team",
      value: String(summary.team.total),
      icon: Users,
      tone: "blue",
      note: `${summary.team.engineering} Engineering · ${summary.team.qa} QA`
    },
    {
      label: "Yesterday's updates",
      value: summary.yesterdayIsWeekend ? "Weekend" : `${summary.yesterday.submitted}/${summary.team.total}`,
      icon: CheckCircle2,
      tone: "green",
      note: summary.yesterdayIsWeekend ? "No status required" : `${summary.yesterday.missing} status${summary.yesterday.missing === 1 ? "" : "es"} missing`
    },
    {
      label: "Status coverage",
      value: summary.yesterday.coveragePercent === null ? "N/A" : `${summary.yesterday.coveragePercent}%`,
      icon: BarChart3,
      tone: "orange",
      note: `For ${yesterdayLabel}`
    },
    {
      label: "Reported work",
      value: durationLabel(summary.yesterday.reportedMinutes),
      icon: Clock3,
      tone: "violet",
      note: `${summary.yesterday.taskCount} task${summary.yesterday.taskCount === 1 ? "" : "s"} reported yesterday`
    }
  ];

  return (
    <div className="dashboard-page page-stack">
      <section className="page-heading">
        <div><p className="welcome-line">Good to see you, {user?.firstName}</p><p>Team status coverage, reported effort, and delivery activity through yesterday.</p></div>
        <div className="page-heading-actions"><span className="date-chip"><CalendarDays size={17} />{today}</span>{user?.role === "ADMIN" && <button className="secondary-button compact" disabled={syncingStatuses} title="Sync Discord statuses and refresh dashboard data" onClick={() => void refreshStatusesInBackground(true)}><RefreshCw className={syncingStatuses ? "is-spinning" : ""} size={16} />{syncingStatuses ? "Syncing..." : "Sync Discord"}</button>}</div>
      </section>

      <section className="metric-grid dashboard-metrics">
        {cards.map(({ label, value, icon: Icon, tone, note }) => <article className="metric-card" key={label}>
          <div className={`metric-icon ${tone}`}><Icon size={20} /></div>
          <span className="metric-label">{label}</span>
          <strong className="metric-value">{value}</strong>
          <span className="metric-note">{note}</span>
        </article>)}
      </section>

      <section className="dashboard-grid dashboard-insights-grid">
        <article className="panel coverage-panel">
          <div className="panel-heading"><div><h2>Seven-day status coverage</h2><p>Daily submissions from active Engineering and QA team members</p></div><span className="coverage-legend"><i />Received</span></div>
          <div className="coverage-chart">
            {summary.recentDays.map((day) => <div className={`coverage-day ${day.isWeekend ? "weekend" : ""}`} key={day.date}>
              <div className="coverage-value">{day.isWeekend ? "Weekend" : `${day.submitted}/${summary.team.total}`}</div>
              <div className="coverage-track" title={day.isWeekend ? "Weekend — no status required" : `${day.coveragePercent}% status coverage`}>
                {day.isWeekend ? <span className="coverage-weekend-mark" /> : <span className="coverage-fill" style={{ height: `${day.coveragePercent ?? 0}%` }} />}
              </div>
              <strong>{dateLabel(day.date, { weekday: "short" })}</strong>
              <small>{dateLabel(day.date, { month: "short", day: "numeric" })}</small>
            </div>)}
          </div>
        </article>

        <article className="panel project-activity-panel">
          <div className="panel-heading"><div><h2>Active projects</h2><p>Tasks reported during the last seven days</p></div><FolderKanban size={19} /></div>
          {summary.projectActivity.length ? <div className="project-activity-list">
            {summary.projectActivity.map((project, index) => <div className="project-activity-row" key={project.id ?? project.name}>
              <span>{index + 1}</span>
              <div><strong>{project.name}</strong><small>{project.taskCount} task{project.taskCount === 1 ? "" : "s"}</small></div>
              <em>{durationLabel(project.reportedMinutes)}</em>
            </div>)}
          </div> : <div className="dashboard-panel-empty"><FolderKanban size={22} /><p>No project activity was reported in this period.</p></div>}
        </article>
      </section>

      <section className="panel yesterday-team-panel">
        <div className="panel-heading"><div><h2>Yesterday&apos;s team status</h2><p>{yesterdayLabel} · Missing updates are shown first</p></div><Link to="/developers">View developers <ChevronRight size={15} /></Link></div>
        {summary.developerStatuses.length ? <div className="dashboard-developer-list">
          {summary.developerStatuses.map((developer) => <Link className="dashboard-developer-row" to={`/developers/${developer.id}`} key={developer.id}>
            <span className="avatar">{developer.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span>
            <div><strong>{developer.name}</strong><small>{developer.jobTitle ?? (developer.specialty === "QA" ? "QA" : "Developer")}</small></div>
            <span className="developer-specialty">{developer.specialty === "QA" ? "Quality assurance" : "Engineering"}</span>
            <span className="developer-reported-work">{developer.submitted ? <>{developer.taskCount} task{developer.taskCount === 1 ? "" : "s"} · {durationLabel(developer.reportedMinutes)}</> : "No work reported"}</span>
            <span className={`yesterday-status ${developer.submitted ? "submitted" : "missing"}`}>{developer.submitted ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}{developer.submitted ? "Status received" : "Status missing"}</span>
            <ChevronRight size={17} />
          </Link>)}
        </div> : <div className="dashboard-panel-empty"><Users size={22} /><p>No active developers are available yet.</p></div>}
      </section>
    </div>
  );
}
