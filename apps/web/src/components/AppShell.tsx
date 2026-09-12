import { BarChart3, Bell, ChevronDown, Code2, FolderKanban, LayoutDashboard, LogOut, Menu, Search, Users, X } from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Brand } from "./Brand";

const overviewNavigation = [
  { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
  { label: "Developers", path: "/developers", icon: Users },
  { label: "Projects", path: "/projects", icon: FolderKanban }
];

const insightNavigation = [
  { label: "Reports", path: "/reports", icon: BarChart3 }
];

const navigation = [...overviewNavigation, ...insightNavigation];

export function AppShell() {
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const currentLabel = navigation.find((item) => location.pathname.startsWith(item.path))?.label ?? "Dashboard";

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-top">
          <Brand />
          <button className="icon-button sidebar-close" aria-label="Close menu" onClick={() => setMobileOpen(false)}><X size={20} /></button>
        </div>
        <div className="workspace-chip">
          <span className="workspace-icon"><Code2 size={17} /></span>
          <span><small>Workspace</small><strong>Engineering</strong></span>
          <ChevronDown size={16} />
        </div>
        <nav className="side-nav" aria-label="Main navigation">
          <p className="nav-label">Overview</p>
          {overviewNavigation.map(({ label, path, icon: Icon }) => (
            <NavLink key={path} to={path} onClick={() => setMobileOpen(false)} className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
              <Icon size={19} />
              <span>{label}</span>
            </NavLink>
          ))}
          <p className="nav-label nav-label-space">Insights</p>
          {insightNavigation.map(({ label, path, icon: Icon }) => (
            <NavLink key={path} to={path} onClick={() => setMobileOpen(false)} className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
              <Icon size={19} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="user-mini">
            <span className="avatar">{user?.firstName[0]}{user?.lastName[0]}</span>
            <span className="user-mini-copy"><strong>{user?.firstName} {user?.lastName}</strong><small>{user?.role === "ADMIN" ? "Administrator" : "Developer"}</small></span>
            <button className="icon-button" aria-label="Sign out" onClick={() => void logout()}><LogOut size={17} /></button>
          </div>
        </div>
      </aside>
      {mobileOpen && <button className="sidebar-scrim" aria-label="Close menu" onClick={() => setMobileOpen(false)} />}

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-title">
            <button className="icon-button menu-button" aria-label="Open menu" onClick={() => setMobileOpen(true)}><Menu size={21} /></button>
            <div><span className="eyebrow">DevPulse</span><h1>{currentLabel}</h1></div>
          </div>
          <div className="topbar-actions">
            <label className="search-box"><Search size={17} /><input aria-label="Search" placeholder="Search" /></label>
            <button className="icon-button notification-button" aria-label="Notifications"><Bell size={20} /><span /></button>
          </div>
        </header>
        <div className="page-content"><Outlet /></div>
      </main>
    </div>
  );
}
