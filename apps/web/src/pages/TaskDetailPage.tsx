import { AlertCircle, ArrowLeft, CheckCircle2, Clock3, ExternalLink, FolderKanban, MessageSquareText, Save, Ticket } from "lucide-react";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import type { ClickUpEnrichment, Project, TaskDetail } from "../types";

function durationLabel(minutes: number | null) {
  if (minutes === null) return "No time reported";
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return [hours ? `${hours}h` : "", remainder ? `${remainder}m` : ""].filter(Boolean).join(" ") || "0m";
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(value));
}

function commentDate(value: string | null) {
  if (!value) return "Date unavailable";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function ClickUpEmptyState({ state }: { state: ClickUpEnrichment["state"] }) {
  const copy = {
    NOT_CLICKUP: ["No ClickUp data", "This task has no ClickUp ticket link. Other ticket providers are intentionally ignored."],
    NOT_CONFIGURED: ["ClickUp is not configured", "Add CLICKUP_API_TOKEN to apps/api/.env, then restart your API."],
    UNAVAILABLE: ["ClickUp data unavailable", "The ticket may not exist, or the configured ClickUp account may not have access."],
    AVAILABLE: ["No ClickUp data", "Ticket data is currently unavailable."]
  }[state];

  return <section className="panel clickup-empty"><Ticket size={26} /><h2>{copy[0]}</h2><p>{copy[1]}</p></section>;
}

export function TaskDetailPage() {
  const { developerId = "", taskId = "" } = useParams();
  const { user } = useAuth();
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [clickup, setClickup] = useState<ClickUpEnrichment | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [savingProject, setSavingProject] = useState(false);
  const [projectNotice, setProjectNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.task(taskId),
      user?.role === "ADMIN" ? api.projects() : Promise.resolve({ projects: [] })
    ])
      .then(([result, projectResult]) => {
        setTask(result.task);
        setClickup(result.clickup);
        setProjects(projectResult.projects);
        setSelectedProjectId(result.task.project?.id ?? "");
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Could not load task."))
      .finally(() => setLoading(false));
  }, [taskId, user?.role]);

  async function saveProjectAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!task) return;
    setSavingProject(true);
    setProjectNotice(null);
    try {
      const { task: updatedTask } = await api.assignTaskProject(task.id, selectedProjectId || null);
      setTask((current) => current ? { ...current, ...updatedTask } : current);
      setSelectedProjectId(updatedTask.project?.id ?? "");
      setProjectNotice({
        type: "success",
        message: updatedTask.project ? `Assigned to ${updatedTask.project.name}.` : "Task marked as unassigned."
      });
    } catch (saveError) {
      setProjectNotice({ type: "error", message: saveError instanceof Error ? saveError.message : "Could not update project." });
    } finally {
      setSavingProject(false);
    }
  }

  if (loading) return <div className="empty-state"><div className="loading-mark" /><h3>Loading task details…</h3></div>;
  if (error || !task || !clickup) return <div className="empty-state"><AlertCircle size={28} /><h3>{error ?? "Task not found"}</h3><Link to={`/developers/${developerId}`}>Return to tasks</Link></div>;

  return (
    <div className="task-detail-page page-stack">
      <Link className="back-link" to={`/developers/${developerId}`}><ArrowLeft size={17} />{task.statusReport.developer.user.firstName}&apos;s tasks</Link>

      <section className="panel task-detail-overview">
        <div className="task-detail-title"><span><Ticket size={20} /></span><div><small>{task.project?.name ?? task.projectName ?? "No project"}</small><h1>{task.description}</h1></div></div>
        <div className="task-detail-meta">
          <span>{dateLabel(task.statusReport.reportDate)}</span>
          <span><Clock3 size={15} />{durationLabel(task.durationMinutes)}</span>
          {task.taskUrl && <a href={task.taskUrl} target="_blank" rel="noreferrer">Open original link <ExternalLink size={14} /></a>}
        </div>
        {user?.role === "ADMIN" && <div className="task-project-assignment">
          <div className="task-project-assignment-copy"><span><FolderKanban size={18} /></span><div><strong>Project assignment</strong><small>Manually override the project selected during Discord sync.</small></div></div>
          <form onSubmit={saveProjectAssignment}>
            <select aria-label="Task project" value={selectedProjectId} onChange={(event) => { setSelectedProjectId(event.target.value); setProjectNotice(null); }}>
              <option value="">Unassigned</option>
              {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
            <button className="primary-button compact" type="submit" disabled={savingProject || selectedProjectId === (task.project?.id ?? "")}><Save size={15} />{savingProject ? "Saving..." : "Save project"}</button>
          </form>
          {projectNotice && <p className={`task-project-notice ${projectNotice.type}`}>{projectNotice.type === "success" ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}{projectNotice.message}</p>}
        </div>}
      </section>

      {clickup.state !== "AVAILABLE" || !clickup.ticket ? <ClickUpEmptyState state={clickup.state} /> : <>
        <section className="panel clickup-ticket-card">
          <div className="clickup-section-heading"><div><small>ClickUp ticket</small><h2>{clickup.ticket.title}</h2></div><a href={clickup.ticket.url} target="_blank" rel="noreferrer">Open in ClickUp <ExternalLink size={14} /></a></div>
          <div className="clickup-description"><h3>Description</h3><p>{clickup.ticket.description ?? "No description was added to this ClickUp ticket."}</p></div>
        </section>

        <section className="panel clickup-comments-card">
          <div className="clickup-section-heading"><div><small>Conversation</small><h2>Comments</h2></div><span>{clickup.comments.length}</span></div>
          {clickup.comments.length === 0 ? <div className="comments-empty"><MessageSquareText size={23} /><p>No comments on this ClickUp ticket.</p></div> : <div className="comment-list">
            {clickup.comments.map((comment) => <article className="comment-item" key={comment.id}>
              {comment.authorAvatar ? <img src={comment.authorAvatar} alt="" /> : <span className="comment-avatar">{comment.author[0]?.toUpperCase() ?? "?"}</span>}
              <div><header><strong>{comment.author}</strong><time>{commentDate(comment.createdAt)}</time></header><p>{comment.text}</p></div>
            </article>)}
          </div>}
        </section>
      </>}
    </div>
  );
}
