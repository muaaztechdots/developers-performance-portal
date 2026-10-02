import { AlertCircle, ArrowLeft, CheckCircle2, Clock3, Code2, ExternalLink, FileCode2, FolderKanban, GitBranch, Github, GitPullRequest, MessageSquareText, RefreshCw, Save, Ticket } from "lucide-react";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { parseGitHubPatch } from "../lib/github-diff";
import type { ClickUpEnrichment, GitHubEnrichment, Project, TaskDetail } from "../types";

type TaskTab = "details" | "github";

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
    PENDING: ["ClickUp sync pending", "The background worker will fetch and save this ticket shortly."],
    UNAVAILABLE: ["ClickUp data unavailable", "The ticket may not exist, or the configured ClickUp account may not have access."],
    AVAILABLE: ["No ClickUp data", "Ticket data is currently unavailable."]
  }[state];

  return <section className="panel clickup-empty"><Ticket size={26} /><h2>{copy[0]}</h2><p>{copy[1]}</p></section>;
}

function GitHubEmptyState({ github, onRetry }: { github: GitHubEnrichment; onRetry: () => void }) {
  const copy = {
    NOT_LINKED: ["No pull request linked", "Add a GitHub pull request URL to the task or a ClickUp comment, then run Sync Tasks again."],
    PENDING: ["GitHub sync pending", "The background worker has linked this pull request and will import its code changes shortly."],
    AUTH_REQUIRED: github.configured
      ? ["GitHub access denied", "The configured token cannot read this repository. Check its repository access and Pull requests permission."]
      : ["GitHub token required", "This may be a private repository. Add GITHUB_TOKEN to your .env file and restart the API."],
    RATE_LIMITED: ["GitHub rate limit reached", "Try again after GitHub resets the API limit. Adding a token provides a much higher limit."],
    NOT_FOUND: ["Pull request not found", "The pull request may have moved, been deleted, or be outside the token's repository access."],
    UNAVAILABLE: ["GitHub changes unavailable", "GitHub could not return the pull request changes right now."],
    AVAILABLE: ["No GitHub changes", "No code changes were returned for this pull request."]
  }[github.state];

  return <section className="panel github-empty-state">
    <Github size={30} />
    <h2>{copy[0]}</h2>
    <p>{copy[1]}</p>
    <div>
      {github.pullRequestUrl && <a className="secondary-button compact" href={github.pullRequestUrl} target="_blank" rel="noreferrer">Open pull request <ExternalLink size={14} /></a>}
      {github.state !== "NOT_LINKED" && <button className="primary-button compact" type="button" onClick={onRetry}><RefreshCw size={14} />Try again</button>}
    </div>
  </section>;
}

function PullRequestFile({ file, initiallyOpen }: { file: GitHubEnrichment["files"][number]; initiallyOpen: boolean }) {
  const diffLines = file.patch ? parseGitHubPatch(file.patch) : [];

  return <details className="github-file" open={initiallyOpen}>
    <summary>
      <span className={`github-file-status ${file.status}`}>{file.status}</span>
      <span className="github-filename"><FileCode2 size={15} />{file.filename}{file.previousFilename && <small>renamed from {file.previousFilename}</small>}</span>
      <span className="github-file-stats"><strong>+{file.additions}</strong><em>-{file.deletions}</em><span>{file.changes} changes</span></span>
    </summary>
    {diffLines.length ? <div className="github-diff" role="table" aria-label={`Code changes for ${file.filename}`}>
      {diffLines.map((line, index) => <div className={`github-diff-line ${line.kind}`} role="row" key={`${index}-${line.content}`}>
        <span className="github-line-number" role="cell">{line.oldLine ?? ""}</span>
        <span className="github-line-number" role="cell">{line.newLine ?? ""}</span>
        <pre role="cell">{line.content || " "}</pre>
      </div>)}
    </div> : <div className="github-patch-unavailable">
      <Code2 size={18} />
      <p>GitHub did not provide a text patch for this file. It may be binary or the diff may be too large.</p>
      {file.blobUrl && <a href={file.blobUrl} target="_blank" rel="noreferrer">View file on GitHub <ExternalLink size={13} /></a>}
    </div>}
  </details>;
}

export function TaskDetailPage() {
  const { developerId = "", taskId = "" } = useParams();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TaskTab>("details");
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [clickup, setClickup] = useState<ClickUpEnrichment | null>(null);
  const [github, setGithub] = useState<GitHubEnrichment | null>(null);
  const [githubLoading, setGithubLoading] = useState(false);
  const [githubError, setGithubError] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [savingProject, setSavingProject] = useState(false);
  const [projectNotice, setProjectNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setActiveTab("details");
    setGithub(null);
    setGithubError(null);
    setLoading(true);
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

  async function loadGitHubChanges(force = false) {
    if (githubLoading || (github && !force)) return;
    setGithubLoading(true);
    setGithubError(null);
    try {
      const result = await api.taskGitHubChanges(taskId);
      setGithub(result.github);
    } catch (caught) {
      setGithubError(caught instanceof Error ? caught.message : "Could not load GitHub changes.");
    } finally {
      setGithubLoading(false);
    }
  }

  function selectTab(tab: TaskTab) {
    setActiveTab(tab);
    if (tab === "github") void loadGitHubChanges();
  }

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
      </section>

      <div className="task-detail-tabs" role="tablist" aria-label="Task information">
        <button id="task-details-tab" role="tab" type="button" aria-selected={activeTab === "details"} aria-controls="task-details-panel" className={activeTab === "details" ? "active" : ""} onClick={() => selectTab("details")}><Ticket size={16} />Details</button>
        <button id="task-github-tab" role="tab" type="button" aria-selected={activeTab === "github"} aria-controls="task-github-panel" className={activeTab === "github" ? "active" : ""} onClick={() => selectTab("github")}><Github size={16} />GitHub changes</button>
      </div>

      {activeTab === "details" ? <div className="task-tab-panel" id="task-details-panel" role="tabpanel" aria-labelledby="task-details-tab">
        <section className="panel task-details-card">
          <div className="task-section-heading"><div><small>Reported work</small><h2>Task details</h2></div>{task.details && <span>{task.details.split("\n").length} items</span>}</div>
          {task.details
            ? <div className="task-detail-work-items"><ul>{task.details.split("\n").map((detail, index) => <li key={`${index}-${detail}`}>{detail}</li>)}</ul></div>
            : <div className="task-details-empty"><Ticket size={20} /><p>No additional task details were reported.</p></div>}
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
      </div> : <div className="task-tab-panel" id="task-github-panel" role="tabpanel" aria-labelledby="task-github-tab">
        {githubLoading ? <section className="panel github-loading"><div className="loading-mark" /><h2>Loading pull request changes…</h2><p>Reading the latest file changes from GitHub.</p></section>
          : githubError ? <section className="panel github-empty-state"><AlertCircle size={30} /><h2>Could not load GitHub changes</h2><p>{githubError}</p><button className="primary-button compact" type="button" onClick={() => void loadGitHubChanges(true)}><RefreshCw size={14} />Try again</button></section>
            : github?.state !== "AVAILABLE" || !github.pullRequest ? github && <GitHubEmptyState github={github} onRetry={() => void loadGitHubChanges(true)} />
              : <>
                <section className="panel github-pr-card">
                  <div className="github-pr-heading">
                    <div className="github-pr-icon"><GitPullRequest size={21} /></div>
                    <div><small>Pull request #{github.pullRequest.number}</small><h2>{github.pullRequest.title}</h2><span>by {github.pullRequest.author}</span></div>
                    <a className="secondary-button compact" href={github.pullRequest.url} target="_blank" rel="noreferrer">Open on GitHub <ExternalLink size={14} /></a>
                  </div>
                  <div className="github-pr-summary">
                    <span className={`github-pr-state ${github.pullRequest.merged ? "merged" : github.pullRequest.state}`}>{github.pullRequest.merged ? "Merged" : github.pullRequest.draft ? "Draft" : github.pullRequest.state}</span>
                    <span className="github-branches"><GitBranch size={14} />{github.pullRequest.sourceBranch}<strong>→</strong>{github.pullRequest.targetBranch}</span>
                    <span>{github.pullRequest.changedFiles} files</span><strong className="github-additions">+{github.pullRequest.additions}</strong><strong className="github-deletions">-{github.pullRequest.deletions}</strong>
                  </div>
                </section>

                <section className="panel github-files-card">
                  <div className="task-section-heading"><div><small>Code review</small><h2>Files changed</h2></div><span>{github.files.length}</span></div>
                  {github.filesTruncated && <p className="github-truncated-notice"><AlertCircle size={14} />GitHub limits this response to 3,000 files. Open the pull request for the complete change set.</p>}
                  {github.files.length ? <div className="github-file-list">{github.files.map((file, index) => <PullRequestFile key={`${file.filename}-${index}`} file={file} initiallyOpen={github.files.length <= 3} />)}</div>
                    : <div className="task-details-empty"><Code2 size={20} /><p>This pull request does not contain any file changes.</p></div>}
                </section>
              </>}
      </div>}
    </div>
  );
}
