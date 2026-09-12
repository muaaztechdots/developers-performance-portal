import { AlertCircle, FolderKanban, ListTodo, Pencil, Plus, Search, Tags } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import type { Project } from "../types";

export function ProjectsPage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.projects()
      .then(({ projects: result }) => setProjects(result))
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Could not load projects."))
      .finally(() => setLoading(false));
  }, []);

  const filteredProjects = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return projects;
    return projects.filter((project) =>
      [project.name, ...project.aliases.map((alias) => alias.name)]
        .some((name) => name.toLocaleLowerCase().includes(normalizedQuery))
    );
  }, [projects, query]);

  return (
    <div className="projects-page page-stack">
      <section className="page-heading">
        <div><p className="welcome-line">Project catalog</p><p>Manage the approved projects used to classify Discord status tasks.</p></div>
        {user?.role === "ADMIN" && <Link className="primary-button compact" to="/projects/new"><Plus size={18} />Add project</Link>}
      </section>

      {error && <div className="sync-notice error" role="alert"><AlertCircle size={18} /><span>{error}</span></div>}

      <section className="panel directory-panel project-directory-panel">
        <div className="directory-tools">
          <div><h2>All projects</h2><p>{projects.length} catalog project{projects.length === 1 ? "" : "s"}</p></div>
          <label className="search-box directory-search"><Search size={17} /><input aria-label="Search projects" placeholder="Search names or aliases" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        </div>

        {loading ? (
          <div className="empty-state"><div className="loading-mark" /><h3>Loading projects...</h3></div>
        ) : filteredProjects.length === 0 ? (
          <div className="empty-state"><div className="empty-icon"><FolderKanban size={24} /></div><h3>{query ? "No projects match your search" : "No projects yet"}</h3><p>{query ? "Try a project alias or another spelling." : "Add a project before importing Discord statuses."}</p></div>
        ) : (
          <div className="project-list">
            {filteredProjects.map((project) => (
              <article className="project-row" key={project.id}>
                <span className="project-row-icon"><FolderKanban size={19} /></span>
                <div className="project-row-identity">
                  <strong>{project.name}</strong>
                  <span>{project.aliases.length ? project.aliases.map((alias) => alias.name).join(" / ") : "Automatic name variations enabled"}</span>
                </div>
                <span className="project-row-stat"><Tags size={14} /><span><strong>{project.aliases.length}</strong><small>aliases</small></span></span>
                <span className="project-row-stat"><ListTodo size={14} /><span><strong>{project._count.tasks}</strong><small>tasks</small></span></span>
                {user?.role === "ADMIN" ? <Link className="project-edit-link" to={`/projects/${project.id}/edit`}><Pencil size={15} />Edit</Link> : <span />}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
