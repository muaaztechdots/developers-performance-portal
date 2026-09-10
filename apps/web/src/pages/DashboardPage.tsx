import { ArrowUpRight, CalendarDays, CheckCircle2, Clock3, MoreHorizontal, TrendingUp, Users } from "lucide-react";
import { useAuth } from "../context/AuthContext";

const cards = [
  { label: "Active developers", value: "—", icon: Users, tone: "blue", note: "Ready for team data" },
  { label: "Today's updates", value: "—", icon: CheckCircle2, tone: "green", note: "No updates yet" },
  { label: "Hours reported", value: "—", icon: Clock3, tone: "violet", note: "This week" },
  { label: "Completion rate", value: "—", icon: TrendingUp, tone: "orange", note: "This week" }
];

export function DashboardPage() {
  const { user } = useAuth();
  const today = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(new Date());

  return (
    <div className="dashboard-page page-stack">
      <section className="page-heading">
        <div><p className="welcome-line">Good to see you, {user?.firstName} <span>👋</span></p><p>Here’s the shape of your team’s work today.</p></div>
        <span className="date-chip"><CalendarDays size={17} />{today}</span>
      </section>
      <section className="metric-grid">
        {cards.map(({ label, value, icon: Icon, tone, note }) => (
          <article className="metric-card" key={label}>
            <div className={`metric-icon ${tone}`}><Icon size={20} /></div>
            <span className="metric-label">{label}</span>
            <strong className="metric-value">{value}</strong>
            <span className="metric-note">{note}</span>
          </article>
        ))}
      </section>
      <section className="dashboard-grid">
        <article className="panel activity-panel">
          <div className="panel-heading"><div><h2>Team activity</h2><p>Daily updates will appear here</p></div><button className="icon-button"><MoreHorizontal size={20} /></button></div>
          <div className="empty-chart">
            <div className="chart-lines"><span /><span /><span /><span /></div>
            <svg viewBox="0 0 640 170" preserveAspectRatio="none" aria-hidden="true"><path d="M0 140 C80 118, 110 130, 170 100 S270 116, 330 76 S430 96, 500 54 S580 60, 640 25" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" /><path d="M0 140 C80 118, 110 130, 170 100 S270 116, 330 76 S430 96, 500 54 S580 60, 640 25 L640 170 L0 170 Z" fill="url(#fade)" /><defs><linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="currentColor" stopOpacity=".16" /><stop offset="1" stopColor="currentColor" stopOpacity="0" /></linearGradient></defs></svg>
            <span className="sample-label">Preview</span>
          </div>
        </article>
        <article className="panel getting-started">
          <div className="panel-heading"><div><h2>Get started</h2><p>Your workspace is ready</p></div></div>
          <div className="setup-list">
            <div className="setup-item done"><span>1</span><div><strong>Workspace created</strong><small>Database and account are ready</small></div><CheckCircle2 size={20} /></div>
            <div className="setup-item"><span>2</span><div><strong>Add your developers</strong><small>Build out your team directory</small></div><ArrowUpRight size={19} /></div>
            <div className="setup-item"><span>3</span><div><strong>Collect daily status</strong><small>Available in the next phase</small></div><ArrowUpRight size={19} /></div>
          </div>
        </article>
      </section>
    </div>
  );
}
