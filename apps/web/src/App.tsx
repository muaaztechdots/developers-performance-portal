import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { useAuth } from "./context/AuthContext";
import { DashboardPage } from "./pages/DashboardPage";
import { DevelopersPage } from "./pages/DevelopersPage";
import { DeveloperEditPage } from "./pages/DeveloperEditPage";
import { DeveloperTasksPage } from "./pages/DeveloperTasksPage";
import { LoginPage } from "./pages/LoginPage";
import { TaskDetailPage } from "./pages/TaskDetailPage";

function ProtectedLayout() {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-screen"><span className="loading-mark" />Loading workspace…</div>;
  return user ? <AppShell /> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedLayout />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/developers" element={<DevelopersPage />} />
        <Route path="/developers/:developerId/edit" element={<DeveloperEditPage />} />
        <Route path="/developers/:developerId" element={<DeveloperTasksPage />} />
        <Route path="/developers/:developerId/tasks/:taskId" element={<TaskDetailPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
