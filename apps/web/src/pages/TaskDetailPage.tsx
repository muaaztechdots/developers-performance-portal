import { AlertCircle, ArrowLeft, Clock3, ExternalLink, MessageSquareText, Ticket } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import type { ClickUpEnrichment, TaskDetail } from "../types";

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
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [clickup, setClickup] = useState<ClickUpEnrichment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.task(taskId)
      .then((result) => { setTask(result.task); setClickup(result.clickup); })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Could not load task."))
      .finally(() => setLoading(false));
  }, [taskId]);

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
