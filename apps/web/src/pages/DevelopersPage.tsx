import { Search, UserPlus, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import type { Developer } from "../types";

export function DevelopersPage() {
  const [developers, setDevelopers] = useState<Developer[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.developers().then(({ developers: data }) => setDevelopers(data)).catch(() => setDevelopers([])).finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => developers.filter((developer) =>
    `${developer.user.firstName} ${developer.user.lastName} ${developer.user.email}`.toLowerCase().includes(query.toLowerCase())
  ), [developers, query]);

  return (
    <div className="developers-page page-stack">
      <section className="page-heading">
        <div><p className="welcome-line">Your engineering team</p><p>Manage the people contributing status updates.</p></div>
        <button className="primary-button compact" disabled title="Available in the next phase"><UserPlus size={18} />Add developer</button>
      </section>
      <section className="panel directory-panel">
        <div className="directory-tools"><div><h2>All developers</h2><p>{developers.length} team member{developers.length === 1 ? "" : "s"}</p></div><label className="search-box directory-search"><Search size={17} /><input placeholder="Search developers" value={query} onChange={(event) => setQuery(event.target.value)} /></label></div>
        {loading ? (
          <div className="empty-state"><div className="empty-icon"><Users size={24} /></div><h3>Loading your team…</h3></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state"><div className="empty-icon"><Users size={24} /></div><h3>{query ? "No matches found" : "No developers yet"}</h3><p>{query ? "Try a different name or email." : "Your developer directory is ready for the next phase."}</p></div>
        ) : (
          <div className="developer-list">
            {filtered.map((developer) => <div className="developer-row" key={developer.id}><span className="avatar">{developer.user.firstName[0]}{developer.user.lastName[0]}</span><div><strong>{developer.user.firstName} {developer.user.lastName}</strong><small>{developer.user.email}</small></div><span>{developer.jobTitle ?? "Developer"}</span><span>{developer._count.statusReports} updates</span><i className={developer.user.isActive ? "status-active" : ""}>{developer.user.isActive ? "Active" : "Inactive"}</i></div>)}
          </div>
        )}
      </section>
    </div>
  );
}
