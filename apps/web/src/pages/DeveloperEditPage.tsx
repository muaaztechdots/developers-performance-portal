import { AlertCircle, ArrowLeft, CheckCircle2, Save, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import type { DeveloperDetail, DeveloperProfile, UpdateDeveloperInput } from "../types";

const emptyForm: UpdateDeveloperInput = {
  email: "",
  firstName: "",
  lastName: "",
  jobTitle: "",
  department: "",
  timezone: "Asia/Karachi",
  specialty: "ENGINEERING",
  isActive: true
};

function profileForm(developer: DeveloperProfile): UpdateDeveloperInput {
  return {
    email: developer.user.email,
    firstName: developer.user.firstName,
    lastName: developer.user.lastName,
    jobTitle: developer.jobTitle ?? "",
    department: developer.department ?? "",
    timezone: developer.timezone,
    specialty: developer.specialty,
    isActive: developer.user.isActive
  };
}

export function DeveloperEditPage() {
  const { developerId = "" } = useParams();
  const { user } = useAuth();
  const [developer, setDeveloper] = useState<DeveloperDetail | null>(null);
  const [form, setForm] = useState<UpdateDeveloperInput>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    if (user?.role !== "ADMIN") return;
    api.developer(developerId)
      .then(({ developer: result }) => {
        setDeveloper(result);
        setForm(profileForm(result));
      })
      .catch((error) => setNotice({ type: "error", message: error instanceof Error ? error.message : "Could not load developer." }))
      .finally(() => setLoading(false));
  }, [developerId, user?.role]);

  function updateField<Key extends keyof UpdateDeveloperInput>(field: Key, value: UpdateDeveloperInput[Key]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function saveDeveloper(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setNotice(null);
    try {
      const { developer: updated } = await api.updateDeveloper(developerId, form);
      setDeveloper((current) => current ? { ...current, ...updated } : current);
      setForm(profileForm(updated));
      setNotice({ type: "success", message: "Developer information updated successfully." });
    } catch (error) {
      setNotice({ type: "error", message: error instanceof Error ? error.message : "Could not update developer." });
    } finally {
      setSaving(false);
    }
  }

  if (user?.role !== "ADMIN") return <Navigate to={`/developers/${developerId}`} replace />;
  if (loading) return <div className="empty-state"><div className="loading-mark" /><h3>Loading developer information…</h3></div>;
  if (!developer) return <div className="empty-state"><AlertCircle size={28} /><h3>Developer not found</h3><Link to="/developers">Return to developers</Link></div>;

  return (
    <div className="developer-edit-page page-stack">
      <Link className="back-link" to="/developers"><ArrowLeft size={17} />Developers</Link>

      <section className="developer-edit-heading">
        <div className="developer-profile-copy">
          <span className="avatar profile-avatar">{form.firstName[0]}{form.lastName[0]}</span>
          <div><p className="welcome-line">Edit developer</p><p>Update {developer.user.firstName} {developer.user.lastName}&apos;s team profile and account access.</p></div>
        </div>
        <Link className="secondary-button compact" to={`/developers/${developer.id}`}>View task history</Link>
      </section>

      {notice && <div className={`sync-notice ${notice.type}`} role="status">{notice.type === "success" ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}<span>{notice.message}</span><button type="button" aria-label="Dismiss message" onClick={() => setNotice(null)}>×</button></div>}

      <form className="panel developer-edit-card" onSubmit={saveDeveloper}>
        <header>
          <div><h2>Developer information</h2><p>These details are used throughout status tracking and performance reports.</p></div>
          <span className={`account-state-pill ${form.isActive ? "active" : "inactive"}`}>{form.isActive ? "Active account" : "Inactive account"}</span>
        </header>

        <div className="developer-edit-grid">
          <label className="edit-field"><span>First name</span><input required maxLength={100} value={form.firstName} onChange={(event) => updateField("firstName", event.target.value)} /></label>
          <label className="edit-field"><span>Last name</span><input required maxLength={100} value={form.lastName} onChange={(event) => updateField("lastName", event.target.value)} /></label>
          <label className="edit-field edit-field-wide"><span>Email address</span><input required type="email" maxLength={320} value={form.email} onChange={(event) => updateField("email", event.target.value)} /></label>
          <label className="edit-field"><span>Job title</span><input maxLength={150} placeholder="e.g. Senior Backend Engineer" value={form.jobTitle} onChange={(event) => updateField("jobTitle", event.target.value)} /></label>
          <label className="edit-field"><span>Department</span><input maxLength={150} placeholder="e.g. Engineering" value={form.department} onChange={(event) => updateField("department", event.target.value)} /></label>
          <label className="edit-field"><span>Team function</span><select value={form.specialty} onChange={(event) => updateField("specialty", event.target.value as UpdateDeveloperInput["specialty"])}><option value="ENGINEERING">Engineering</option><option value="QA">Quality assurance</option></select></label>
          <label className="edit-field"><span>Timezone</span><input required list="developer-timezones" maxLength={100} value={form.timezone} onChange={(event) => updateField("timezone", event.target.value)} /><datalist id="developer-timezones"><option value="Asia/Karachi" /><option value="UTC" /><option value="Europe/London" /><option value="America/New_York" /></datalist></label>
        </div>

        <div className="developer-account-controls">
          <label className="developer-active-control">
            <input type="checkbox" checked={form.isActive} onChange={(event) => updateField("isActive", event.target.checked)} />
            <span><strong>Account access</strong><small>{form.isActive ? "This developer can sign in." : "This developer cannot sign in until reactivated."}</small></span>
          </label>
          <div className="discord-profile-note"><ShieldCheck size={19} /><span><strong>{developer.discordThreadName ?? "No Discord thread linked"}</strong><small>Discord linkage is read-only and remains unchanged by profile edits.</small></span></div>
        </div>

        <footer className="developer-edit-actions">
          <Link className="secondary-button compact" to="/developers">Cancel</Link>
          <button className="primary-button compact" disabled={saving} type="submit"><Save size={17} />{saving ? "Saving…" : "Save changes"}</button>
        </footer>
      </form>
    </div>
  );
}
