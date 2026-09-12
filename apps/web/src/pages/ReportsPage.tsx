import { AlertCircle, BarChart3, CalendarDays, CheckCircle2, ChevronDown, Clock3, ExternalLink, FolderKanban, ListTodo, RefreshCw, TicketCheck, Users } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import type { Developer, PerformanceReport } from "../types";

function localDateInput(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function durationLabel(minutes: number | null) {
  if (minutes === null) return "No time";
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return [hours ? `${hours}h` : "", remainder ? `${remainder}m` : ""].filter(Boolean).join(" ") || "0m";
}

function dateLabel(value: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }).format(new Date(`${value}T00:00:00.000Z`));
}

function isWeekend(value: string) {
  const day = new Date(`${value}T00:00:00.000Z`).getUTCDay();
  return day === 0 || day === 6;
}

type PeriodKind = "this_month" | "last_month" | "this_week" | "last_week" | "custom_month" | "custom_date";

function addDays(value: Date, days: number) {
  const result = new Date(value);
  result.setDate(result.getDate() + days);
  return result;
}

function periodRequest(kind: PeriodKind, month: string, date: string) {
  const now = new Date();
  if (kind === "this_month") return { month: localDateInput(now).slice(0, 7) };
  if (kind === "last_month") return { month: localDateInput(new Date(now.getFullYear(), now.getMonth() - 1, 1)).slice(0, 7) };
  if (kind === "custom_month") return { month };
  if (kind === "custom_date") return { date };

  const today = new Date(`${localDateInput(now)}T12:00:00`);
  const monday = addDays(today, -((today.getDay() + 6) % 7));
  if (kind === "this_week") return { from: localDateInput(monday), to: localDateInput(today) };
  return { from: localDateInput(addDays(monday, -7)), to: localDateInput(addDays(monday, -1)) };
}

export function ReportsPage() {
  const { user } = useAuth();
  const today = localDateInput();
  const [developers, setDevelopers] = useState<Developer[]>([]);
  const [developerId, setDeveloperId] = useState("");
  const [periodKind, setPeriodKind] = useState<PeriodKind>("this_month");
  const [month, setMonth] = useState(today.slice(0, 7));
  const [date, setDate] = useState(today);
  const [report, setReport] = useState<PerformanceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const periodPickerRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (user?.role !== "ADMIN") return;
    api.developers().then((result) => setDevelopers(result.developers)).catch(() => setDevelopers([]));
  }, [user?.role]);

  useEffect(() => {
    if (!user) return;
    if ((periodKind === "custom_month" && !month) || (periodKind === "custom_date" && !date)) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.performanceReport({
      developerId: user.role === "ADMIN" ? developerId || undefined : undefined,
      ...periodRequest(periodKind, month, date)
    }).then((result) => {
      if (!cancelled) setReport(result.report);
    }).catch((loadError) => {
      if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Could not load report.");
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [date, developerId, month, periodKind, user]);

  function selectPeriod(kind: PeriodKind) {
    setPeriodKind(kind);
    periodPickerRef.current?.removeAttribute("open");
  }

  const maxDailyMinutes = useMemo(() => Math.max(1, ...(report?.dailyActivity.map((day) => day.reportedMinutes) ?? [])), [report]);
  const maxProjectValue = useMemo(() => Math.max(1, ...(report?.projectBreakdown.map((project) => project.reportedMinutes || project.taskCount) ?? [])), [report]);
  const selectedDeveloper = developers.find((developer) => developer.id === report?.filters.developerId);
  const scopeLabel = report
    ? report.filters.mode === "date" || report.filters.from === report.filters.to
      ? dateLabel(report.filters.from, { weekday: "long", month: "long", day: "numeric", year: "numeric" })
      : report.filters.mode === "month"
        ? dateLabel(report.filters.from, { month: "long", year: "numeric" })
        : `${dateLabel(report.filters.from, { month: "short", day: "numeric", year: "numeric" })} - ${dateLabel(report.filters.to, { month: "short", day: "numeric", year: "numeric" })}`
    : "";
  const periodControlLabel = {
    this_month: "This month",
    last_month: "Last month",
    this_week: "This week",
    last_week: "Last week",
    custom_month: month ? dateLabel(`${month}-01`, { month: "long", year: "numeric" }) : "Choose month",
    custom_date: date ? dateLabel(date, { month: "short", day: "numeric", year: "numeric" }) : "Choose date"
  }[periodKind];

  const cards = report ? [
    { label: "Reported hours", value: durationLabel(report.stats.totalMinutes), icon: Clock3, tone: "violet", note: `${report.stats.timedTasks}/${report.stats.taskCount} tasks include time` },
    { label: "Tasks worked on", value: String(report.stats.taskCount), icon: ListTodo, tone: "blue", note: `${report.stats.linkedTickets} tasks have ticket links` },
    { label: "Status days", value: String(report.stats.statusDays), icon: CalendarDays, tone: "green", note: selectedDeveloper ? `${selectedDeveloper.user.firstName}'s submitted days` : "Combined developer status days" },
    { label: "Average per status", value: durationLabel(report.stats.averageMinutesPerStatusDay), icon: BarChart3, tone: "orange", note: "Reported time divided by status days" }
  ] : [];

  return (
    <div className="reports-page page-stack">
      <section className="page-heading">
        <div><p className="welcome-line">Performance reports</p><p>Review reported effort, delivery activity, and data completeness by engineer and period.</p></div>
      </section>

      <section className="panel report-filters">
        {user?.role === "ADMIN" && <label><span>Engineer</span><select value={developerId} onChange={(event) => setDeveloperId(event.target.value)}><option value="">All engineers and QA</option>{developers.map((developer) => <option key={developer.id} value={developer.id}>{developer.user.firstName} {developer.user.lastName}</option>)}</select></label>}
        <details className="report-period-picker" ref={periodPickerRef}>
          <summary><span>Period</span><div><CalendarDays size={16} /><strong>{periodControlLabel}</strong><ChevronDown size={15} /></div></summary>
          <div className="report-period-menu">
            <span>Quick ranges</span>
            <div className="report-period-presets">{(["this_month", "last_month", "this_week", "last_week"] as const).map((kind) => <button className={periodKind === kind ? "active" : ""} key={kind} type="button" onClick={() => selectPeriod(kind)}>{{ this_month: "This month", last_month: "Last month", this_week: "This week", last_week: "Last week" }[kind]}</button>)}</div>
            <span>Custom period</span>
            <label><span>Month</span><input type="month" value={month} onChange={(event) => { setMonth(event.target.value); setPeriodKind("custom_month"); if (event.target.value) periodPickerRef.current?.removeAttribute("open"); }} /></label>
            <label><span>Specific date</span><input type="date" value={date} onChange={(event) => { setDate(event.target.value); setPeriodKind("custom_date"); if (event.target.value) periodPickerRef.current?.removeAttribute("open"); }} /></label>
          </div>
        </details>
        {loading && <span className="report-auto-status loading"><RefreshCw className="is-spinning" size={15} />Updating report...</span>}
      </section>

      {error && <div className="sync-notice error" role="alert"><AlertCircle size={18} /><span>{error}</span><button type="button" aria-label="Dismiss error" onClick={() => setError(null)}>x</button></div>}
      {loading && !report ? <div className="empty-state"><div className="loading-mark" /><h3>Building report...</h3></div> : report && <>
        <div className="report-scope"><strong>{selectedDeveloper ? `${selectedDeveloper.user.firstName} ${selectedDeveloper.user.lastName}` : user?.role === "ADMIN" ? "Entire team" : `${user?.firstName} ${user?.lastName}`}</strong><span>{scopeLabel}</span></div>

        <section className="metric-grid report-metrics">
          {cards.map(({ label, value, icon: Icon, tone, note }) => <article className="metric-card" key={label}><div className={`metric-icon ${tone}`}><Icon size={20} /></div><span className="metric-label">{label}</span><strong className="metric-value">{value}</strong><span className="metric-note">{note}</span></article>)}
        </section>

        <section className="report-quality-grid">
          {[
            ["Project assignment", report.stats.projectCoveragePercent, `${report.stats.assignedTasks}/${report.stats.taskCount} tasks categorized`, FolderKanban],
            ["Time reporting", report.stats.timeCoveragePercent, `${report.stats.timedTasks}/${report.stats.taskCount} tasks timed`, Clock3],
            ["Ticket coverage", report.stats.ticketCoveragePercent, `${report.stats.linkedTickets}/${report.stats.taskCount} tasks linked`, TicketCheck]
          ].map(([label, percent, note, Icon]) => {
            const QualityIcon = Icon as typeof FolderKanban;
            const value = percent as number | null;
            return <article className="panel report-quality-card" key={label as string}><span><QualityIcon size={18} /></span><div><header><strong>{label as string}</strong><em>{value === null ? "N/A" : `${value}%`}</em></header><div className="report-quality-track"><i style={{ width: `${value ?? 0}%` }} /></div><small>{note as string}</small></div></article>;
          })}
        </section>

        <section className="report-chart-grid">
          <article className="panel report-daily-panel">
            <div className="panel-heading"><div><h2>Daily reported hours</h2><p>Effort and task volume across the selected period.</p></div><BarChart3 size={18} /></div>
            <div className="report-daily-chart">
              {report.dailyActivity.map((day) => <div className={`report-day-bar ${isWeekend(day.date) ? "weekend" : ""}`} key={day.date} title={`${durationLabel(day.reportedMinutes)} / ${day.taskCount} tasks / ${day.developersReported} developers`}><span>{day.reportedMinutes ? durationLabel(day.reportedMinutes) : ""}</span><div><i style={{ height: `${Math.max(day.reportedMinutes ? 5 : 0, (day.reportedMinutes / maxDailyMinutes) * 100)}%` }} /></div><strong>{dateLabel(day.date, { day: "numeric" })}</strong><small>{dateLabel(day.date, { weekday: "short" })}</small></div>)}
            </div>
          </article>

          <article className="panel report-project-panel">
            <div className="panel-heading"><div><h2>Project allocation</h2><p>Where reported time was spent.</p></div><FolderKanban size={18} /></div>
            {report.projectBreakdown.length ? <div className="report-project-list">{report.projectBreakdown.slice(0, 8).map((project) => { const value = project.reportedMinutes || project.taskCount; return <div className="report-project-item" key={project.id ?? "unassigned"}><div><strong>{project.name}</strong><span>{durationLabel(project.reportedMinutes)} / {project.taskCount} tasks</span></div><div className="report-project-track"><i style={{ width: `${(value / maxProjectValue) * 100}%` }} /></div></div>; })}</div> : <div className="report-panel-empty"><FolderKanban size={24} /><p>No project activity in this period.</p></div>}
          </article>
        </section>

        {report.developerBreakdown.length > 0 && <section className="panel report-engineer-panel">
          <div className="panel-heading"><div><h2>Engineer summary</h2><p>Reported days, tasks, time, and linked-ticket activity.</p></div><Users size={18} /></div>
          <div className="report-engineer-list">{report.developerBreakdown.map((developer) => <Link to={`/developers/${developer.id}`} className="report-engineer-row" key={developer.id}><span className="avatar">{developer.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span><div><strong>{developer.name}</strong><small>{developer.specialty === "QA" ? "Quality assurance" : "Engineering"}</small></div><span><strong>{developer.statusDays}</strong><small>status days</small></span><span><strong>{developer.taskCount}</strong><small>tasks</small></span><span><strong>{durationLabel(developer.reportedMinutes)}</strong><small>reported</small></span><span><strong>{developer.linkedTickets}</strong><small>tickets</small></span></Link>)}</div>
        </section>}

        <section className="panel report-worklog-panel">
          <div className="panel-heading"><div><h2>Task work log</h2><p>{report.tasks.length > 200 ? `Showing the latest 200 of ${report.tasks.length} tasks.` : `${report.tasks.length} task${report.tasks.length === 1 ? "" : "s"} in this period.`}</p></div><CheckCircle2 size={18} /></div>
          {report.tasks.length ? <div className="report-worklog"><div className="report-worklog-head"><span>Date</span><span>Engineer</span><span>Task</span><span>Project</span><span>Time</span><span>Link</span></div>{report.tasks.slice(0, 200).map((task) => <div className="report-worklog-row" key={task.id}><span>{dateLabel(task.date, { month: "short", day: "numeric" })}</span><span>{task.developer.name}</span><Link to={`/developers/${task.developer.id}/tasks/${task.id}`}>{task.description}</Link><span>{task.project?.name ?? task.projectName ?? "Unassigned"}</span><span>{durationLabel(task.durationMinutes)}</span>{task.taskUrl ? <a href={task.taskUrl} target="_blank" rel="noreferrer" aria-label="Open task link"><ExternalLink size={14} /></a> : <span>-</span>}</div>)}</div> : <div className="report-panel-empty"><ListTodo size={24} /><p>No tasks were reported for these filters.</p></div>}
        </section>
      </>}
    </div>
  );
}
