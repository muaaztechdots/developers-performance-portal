import { AlertCircle, CheckCircle2, RefreshCw, Search, UserPlus, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import type { Developer } from "../types";

export function DevelopersPage() {
  const { user } = useAuth();
  const [developers, setDevelopers] = useState<Developer[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncNotice, setSyncNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const loadDevelopers = useCallback(async () => {
    const { developers: data } = await api.developers();
    setDevelopers(data);
  }, []);

  useEffect(() => {
    loadDevelopers().catch(() => setDevelopers([])).finally(() => setLoading(false));
  }, [loadDevelopers]);

  async function syncFromDiscord() {
    setSyncing(true);
    setSyncNotice(null);
    try {
      const { result } = await api.syncDiscordDevelopers();
      await loadDevelopers();
      const synced = result.developersCreated + result.developersLinked + result.developersUnchanged;
      const errorSuffix = result.errors.length ? ` ${result.errors.length} thread${result.errors.length === 1 ? "" : "s"} could not be synced.` : "";
      setSyncNotice({
        type: result.errors.length ? "error" : "success",
        message: `Synced ${synced} of ${result.threadsScanned} Discord threads. ${result.developersCreated} new developer${result.developersCreated === 1 ? "" : "s"} added.${errorSuffix}`
      });
    } catch (error) {
      setSyncNotice({ type: "error", message: error instanceof Error ? error.message : "Discord sync failed." });
    } finally {
      setSyncing(false);
    }
  }

  const filtered = useMemo(() => developers.filter((developer) =>
    `${developer.user.firstName} ${developer.user.lastName} ${developer.user.email}`.toLowerCase().includes(query.toLowerCase())
  ), [developers, query]);

  return (
    <div className="developers-page page-stack">
      <section className="page-heading">
        <div><p className="welcome-line">Your engineering team</p><p>Manage the people contributing status updates.</p></div>
        <div className="page-heading-actions">
          <button className="secondary-button compact" disabled title="Available in the next phase"><UserPlus size={18} />Add developer</button>
          {user?.role === "ADMIN" && <button className="primary-button compact" disabled={syncing} onClick={() => void syncFromDiscord()}><RefreshCw className={syncing ? "is-spinning" : ""} size={18} />{syncing ? "Syncing…" : "Sync Discord"}</button>}
        </div>
      </section>
      {syncNotice && <div className={`sync-notice ${syncNotice.type}`} role="status">{syncNotice.type === "success" ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}<span>{syncNotice.message}</span><button type="button" aria-label="Dismiss sync message" onClick={() => setSyncNotice(null)}>×</button></div>}
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
