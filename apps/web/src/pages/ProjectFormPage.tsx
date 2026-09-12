import { AlertCircle, ArrowLeft, CheckCircle2, FolderKanban, Save, Sparkles, Tags } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";

function parseAliases(value: string) {
  return [...new Set(value.split(/[\n,]/).map((alias) => alias.trim()).filter(Boolean))];
}

export function ProjectFormPage() {
  const { projectId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const editing = Boolean(projectId);
  const [name, setName] = useState("");
  const [aliasesText, setAliasesText] = useState("");
  const [taskCount, setTaskCount] = useState(0);
  const [loading, setLoading] = useState(editing);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(
    location.state && typeof location.state === "object" && "created" in location.state
      ? { type: "success", message: "Project added successfully." }
      : null
  );
  const aliases = useMemo(() => parseAliases(aliasesText), [aliasesText]);

  useEffect(() => {
    if (!editing || user?.role !== "ADMIN" || !projectId) return;
    api.project(projectId)
      .then(({ project }) => {
        setName(project.name);
        setAliasesText(project.aliases.map((alias) => alias.name).join("\n"));
        setTaskCount(project._count.tasks);
      })
      .catch((loadError) => {
        setLoadFailed(true);
        setNotice({ type: "error", message: loadError instanceof Error ? loadError.message : "Could not load project." });
      })
      .finally(() => setLoading(false));
  }, [editing, projectId, user?.role]);

  async function saveProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setNotice(null);
    try {
      if (editing && projectId) {
        const { project } = await api.updateProject(projectId, { name, aliases });
        setName(project.name);
        setAliasesText(project.aliases.map((alias) => alias.name).join("\n"));
        setTaskCount(project._count.tasks);
        setNotice({ type: "success", message: "Project updated successfully." });
      } else {
        const { project } = await api.createProject({ name, aliases });
        setNotice({ type: "success", message: "Project added successfully." });
        navigate(`/projects/${project.id}/edit`, { replace: true, state: { created: true } });
      }
    } catch (saveError) {
      setNotice({ type: "error", message: saveError instanceof Error ? saveError.message : "Could not save project." });
    } finally {
      setSaving(false);
    }
  }

  if (user?.role !== "ADMIN") return <Navigate to="/projects" replace />;
  if (loading) return <div className="empty-state"><div className="loading-mark" /><h3>Loading project...</h3></div>;
  if (loadFailed) return <div className="empty-state"><AlertCircle size={28} /><h3>Could not load project</h3><p>{notice?.message}</p><Link to="/projects">Return to projects</Link></div>;

  return (
    <div className="project-form-page page-stack">
      <Link className="back-link" to="/projects"><ArrowLeft size={17} />Projects</Link>

      <section className="project-form-heading">
        <span><FolderKanban size={22} /></span>
        <div><p className="welcome-line">{editing ? "Edit project" : "Add project"}</p><p>{editing ? `${taskCount} task${taskCount === 1 ? " is" : "s are"} currently assigned to this project.` : "Create an approved project for future Discord task matching."}</p></div>
      </section>

      {notice && <div className={`sync-notice ${notice.type}`} role="status">{notice.type === "success" ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}<span>{notice.message}</span><button type="button" aria-label="Dismiss message" onClick={() => setNotice(null)}>x</button></div>}

      <form className="panel project-form-card" onSubmit={saveProject}>
        <header><div><h2>Project information</h2><p>The canonical name is shown on every matched task.</p></div></header>
        <div className="project-form-fields">
          <label className="edit-field"><span>Project name</span><input required maxLength={200} placeholder="e.g. HomeliCare" value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label className="edit-field"><span>Aliases <small>(optional, one per line or comma-separated)</small></span><textarea maxLength={6000} rows={7} placeholder={"HC\nHome Care Portal"} value={aliasesText} onChange={(event) => setAliasesText(event.target.value)} /></label>
          {aliases.length > 0 && <div className="project-alias-preview"><span><Tags size={14} />Aliases to match</span><div>{aliases.map((alias) => <em key={alias}>{alias}</em>)}</div></div>}
          <div className="project-matching-note"><Sparkles size={19} /><span><strong>Automatic matching is included</strong><small>Casing, spaces, punctuation, "Project", and endings such as Web, Website, App, Mobile App, iOS, or Android are ignored. Minor spelling mistakes are matched conservatively.</small></span></div>
        </div>
        <footer className="developer-edit-actions"><Link className="secondary-button compact" to="/projects">Cancel</Link><button className="primary-button compact" disabled={saving} type="submit"><Save size={17} />{saving ? "Saving..." : editing ? "Save changes" : "Add project"}</button></footer>
      </form>
    </div>
  );
}
