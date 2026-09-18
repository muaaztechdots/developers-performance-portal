import { AlertCircle, ArrowLeft, ChevronDown, Clock3, ExternalLink, FolderKanban, ListTodo, Pencil, Tags, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { groupProjectTasks } from "../lib/project-task-groups";
import type { ProjectDetail } from "../types";

function durationLabel(minutes: number | null) {
  if (minutes === null) return "No time reported";
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return [hours ? `${hours}h` : "", remainder ? `${remainder}m` : ""].filter(Boolean).join(" ") || "0m";
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(value));
}

export function ProjectDetailPage() {
  const { projectId = "" } = useParams();
  const { user } = useAuth();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.projectDetail(projectId)
      .then(({ project: result }) => { if (!cancelled) setProject(result); })
      .catch((loadError) => { if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Could not load project."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [projectId]);

  const taskGroups = useMemo(() => groupProjectTasks(project?.tasks ?? []), [project?.tasks]);

  if (loading) return <div className="empty-state"><div className="loading-mark" /><h3>Loading project activity...</h3></div>;
  if (error || !project) return <div className="empty-state"><AlertCircle size={28} /><h3>{error ?? "Project not found"}</h3><Link to="/projects">Return to projects</Link></div>;

  return (
    <div className="project-detail-page page-stack">
      <Link className="back-link" to="/projects"><ArrowLeft size={17} />Projects</Link>

      <section className="project-detail-heading">
        <div className="project-detail-title">
          <span><FolderKanban size={22} /></span>
          <div><p className="welcome-line">{project.name}</p><p>Project task history and reported effort.</p></div>
        </div>
        {user?.role === "ADMIN" && <Link className="secondary-button compact" to={`/projects/${project.id}/edit`}><Pencil size={16} />Edit project</Link>}
      </section>

      {project.aliases.length > 0 && <div className="project-detail-aliases"><Tags size={14} /><span>Aliases</span>{project.aliases.map((alias) => <em key={alias.id}>{alias.name}</em>)}</div>}

      <section className="task-summary-row project-detail-summary">
        <div><strong>{durationLabel(project.stats.totalMinutes)}</strong><span>Total reported time</span></div>
        <div><strong>{taskGroups.length}</strong><span>Unique tasks</span></div>
        <div><strong>{project.stats.taskCount}</strong><span>Reported entries</span></div>
        <div><strong>{project.stats.developerCount}</strong><span>Contributors</span></div>
      </section>

      <section className="panel project-detail-task-panel">
        <div className="panel-heading">
          <div><h2>Tasks grouped by name</h2><p>{taskGroups.length} unique task{taskGroups.length === 1 ? "" : "s"} across {project.stats.taskCount} reported entries. Expand a task to review its history.</p></div>
          <ListTodo size={18} />
        </div>
        {project.tasks.length ? (
          <div className="project-task-groups">
            <div className="project-task-group-head" aria-hidden="true"><span>Task</span><span>Entries</span><span>Contributors</span><span>Total time</span><span /></div>
            {taskGroups.map((group) => <details className="project-task-group" key={group.key}>
              <summary>
                <span className="project-task-group-title"><strong>{group.description}</strong><small>Last worked {dateLabel(group.latestDate)}</small></span>
                <span><strong>{group.entries.length}</strong><small>report{group.entries.length === 1 ? "" : "s"}</small></span>
                <span className="project-task-group-contributors">{group.contributors.map((contributor) => contributor.name).join(", ")}</span>
                <span className="project-task-group-total"><Clock3 size={14} />{durationLabel(group.timedEntryCount ? group.totalMinutes : null)}</span>
                <ChevronDown size={16} />
              </summary>
              <div className="project-task-group-entries">
                <div className="project-detail-table-head" aria-hidden="true"><span>Date</span><span>Developer</span><span>Details</span><span>Time</span><span>Link</span></div>
                {group.entries.map((task) => {
                  const developer = task.statusReport.developer;
                  const developerName = `${developer.user.firstName} ${developer.user.lastName}`.trim();
                  const details = task.details?.split("\n") ?? [];
                  return <div className="project-detail-task-row" key={task.id}>
                    <span>{dateLabel(task.statusReport.reportDate)}</span>
                    <Link className="project-task-developer" to={`/developers/${developer.id}`}><Users size={13} />{developerName}</Link>
                    <div className="project-task-copy"><Link className="project-task-name" to={`/developers/${developer.id}/tasks/${task.id}`}>{details[0] ?? "View task details"}</Link>{details.length > 0 && <span>{details.length} detail item{details.length === 1 ? "" : "s"}</span>}</div>
                    <span className="task-duration"><Clock3 size={14} />{durationLabel(task.durationMinutes)}</span>
                    {task.taskUrl ? <a className="project-task-external" href={task.taskUrl} target="_blank" rel="noreferrer" aria-label="Open original task link"><ExternalLink size={14} /></a> : <span className="task-link-empty">-</span>}
                  </div>;
                })}
              </div>
            </details>)}
          </div>
        ) : <div className="report-panel-empty"><ListTodo size={24} /><p>No tasks are assigned to this project yet.</p></div>}
      </section>
    </div>
  );
}
