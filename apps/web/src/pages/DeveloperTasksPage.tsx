import { AlertCircle, ArrowLeft, CalendarDays, CheckCircle2, Clock3, ExternalLink, GitPullRequest, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { buildDeveloperCalendar, todayInPakistan, yesterdayInPakistan } from "../lib/developer-calendar";
import type { DeveloperDetail, DiscordSyncJob } from "../types";

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function durationLabel(minutes: number | null) {
  if (minutes === null) return "No time reported";
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return [hours ? `${hours}h` : "", remainder ? `${remainder}m` : ""].filter(Boolean).join(" ") || "0m";
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(value));
}

export function DeveloperTasksPage() {
  const { developerId = "" } = useParams();
  const { user } = useAuth();
  const [developer, setDeveloper] = useState<DeveloperDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncJob, setSyncJob] = useState<DiscordSyncJob | null>(null);
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const loadDeveloper = useCallback(async () => {
    const result = await api.developer(developerId);
    setDeveloper(result.developer);
    setSyncJob(result.developer.syncJobs[0] ?? null);
  }, [developerId]);

  useEffect(() => {
    loadDeveloper().catch((error) => setNotice({ type: "error", message: error instanceof Error ? error.message : "Could not load developer." })).finally(() => setLoading(false));
  }, [loadDeveloper]);

  async function syncTasks() {
    setNotice(null);
    try {
      let { job } = await api.syncDeveloperTasks(developerId);
      setSyncJob(job);
      while (job.status === "PENDING" || job.status === "RUNNING") {
        await wait(1_200);
        ({ job } = await api.developerSyncJob(developerId, job.id));
        setSyncJob(job);
      }
      if (job.status === "FAILED") throw new Error(job.error ?? "Discord task sync failed.");
      await loadDeveloper();
      setNotice({ type: "success", message: `Imported ${job.importedTasks} Today task${job.importedTasks === 1 ? "" : "s"} from ${job.processedMessages} Discord messages.` });
    } catch (error) {
      setNotice({ type: "error", message: error instanceof Error ? error.message : "Discord task sync failed." });
    }
  }

  if (loading) return <div className="empty-state"><div className="loading-mark" /><h3>Loading developer activity…</h3></div>;
  if (!developer) return <div className="empty-state"><AlertCircle size={28} /><h3>Developer not found</h3><Link to="/developers">Return to developers</Link></div>;

  const reports = developer.statusReports.filter((report) => report.tasks.length > 0);
  const reportsByDate = new Map(reports.map((report) => [report.reportDate.slice(0, 10), report]));
  const calendarDays = buildDeveloperCalendar(
    [...developer.statusReports.map((report) => report.reportDate), yesterdayInPakistan()],
    todayInPakistan()
  );
  const missingWeekdays = calendarDays.filter((day) => !day.isWeekend && !reportsByDate.has(day.date)).length;
  const syncing = syncJob?.status === "PENDING" || syncJob?.status === "RUNNING";

  return (
    <div className="developer-detail-page page-stack">
      <Link className="back-link" to="/developers"><ArrowLeft size={17} />Developers</Link>
      <section className="developer-profile-heading">
        <div className="developer-profile-copy">
          <span className="avatar profile-avatar">{developer.user.firstName[0]}{developer.user.lastName[0]}</span>
          <div><p className="welcome-line">{developer.user.firstName} {developer.user.lastName}</p><p>{developer.jobTitle ?? "Developer"} · {developer.department ?? "Engineering"}</p></div>
        </div>
        {user?.role === "ADMIN" && <button className="primary-button compact" disabled={syncing || !developer.discordThreadId} title={developer.discordThreadId ? "Import Today tasks from this developer's Discord thread" : "Sync developers first to link a Discord thread"} onClick={() => void syncTasks()}><RefreshCw className={syncing ? "is-spinning" : ""} size={18} />{syncing ? "Syncing" : "Sync Tasks"}</button>}
      </section>

      {notice && <div className={`sync-notice ${notice.type}`} role="status">{notice.type === "success" ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}<span>{notice.message}</span><button onClick={() => setNotice(null)} aria-label="Dismiss">×</button></div>}

      <section className="task-summary-row">
        <div><strong>{reports.length}</strong><span>Statuses received</span></div>
        <div><strong>{missingWeekdays}</strong><span>Weekdays missing</span></div>
        <div><strong>{reports.reduce((total, report) => total + report.tasks.length, 0)}</strong><span>Today tasks imported</span></div>
        <div><strong>{developer.discordThreadName ?? "Not linked"}</strong><span>Discord thread</span></div>
      </section>

      <section className="report-timeline">
        {calendarDays.map((day) => {
          const report = reportsByDate.get(day.date);

          if (!report) {
            return <article className={`report-day ${day.isWeekend ? "weekend-day" : "missing-day"}`} key={day.date}>
              <header>
                <div><h2>{dateLabel(day.date)}</h2><span>{day.isWeekend ? "No status required" : "No update received"}</span></div>
                <em>{day.isWeekend ? <><CalendarDays size={13} />Weekend</> : <><AlertCircle size={13} />Status missing</>}</em>
              </header>
            </article>;
          }

          return <article className={`report-day ${day.isWeekend ? "weekend-day" : "received-day"}`} key={day.date}>
            <header>
              <div><h2>{dateLabel(report.reportDate)}</h2><span>{report.tasks.length} task{report.tasks.length === 1 ? "" : "s"} · {report.source === "DISCORD" ? "Discord" : "Manual"}</span></div>
              <em>{day.isWeekend ? <><CalendarDays size={13} />Weekend</> : <><CheckCircle2 size={13} />Status received</>}</em>
            </header>
            <div className="task-list">
              <div className="task-list-header" aria-hidden="true">
                <span>Task</span><span>Time</span><span>ClickUp</span><span>Pull request</span>
              </div>
              {report.tasks.map((task) => <div className="task-row" key={task.id}>
                <div className="task-copy"><Link className="task-detail-link" to={`/developers/${developer.id}/tasks/${task.id}`}>{task.description}</Link><span>{task.project?.name ?? task.projectName ?? "No project"}</span></div>
                <span className="task-duration"><Clock3 size={14} />{durationLabel(task.durationMinutes)}</span>
                <span className="task-link-cell">
                  {task.clickUpUrl
                    ? <a className="task-source-link" href={task.clickUpUrl} target="_blank" rel="noreferrer" aria-label="Open ClickUp ticket">Ticket<ExternalLink size={13} /></a>
                    : <span className="task-link-empty">—</span>}
                </span>
                <span className="task-link-cell">
                  {task.pullRequestUrl
                    ? <a className="task-source-link pr-link" href={task.pullRequestUrl} target="_blank" rel="noreferrer" aria-label="Open GitHub pull request"><GitPullRequest size={14} />View PR</a>
                    : task.pullRequestState === "MISSING"
                      ? <span className="pr-missing"><AlertCircle size={13} />PR missing</span>
                      : task.pullRequestState === "PENDING"
                        ? <span className="pr-pending">Checking…</span>
                        : <span className="task-link-empty">—</span>}
                </span>
              </div>)}
            </div>
          </article>;
        })}
      </section>
    </div>
  );
}
