import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import { Loader2 } from "lucide-react";

import AppShell      from "./components/layout/AppShell";
import LoginPage     from "./pages/LoginPage";
import HomePage      from "./pages/HomePage";
import UserPage      from "./pages/UserPage";
import ComputerPage  from "./pages/ComputerPage";
import DocusnapPage  from "./pages/DocusnapPage";
import AuditPage     from "./pages/AuditPage";

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--brand)" }} />
    </div>
  );

  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route path="/" element={
        <ProtectedRoute>
          <AppShell />
        </ProtectedRoute>
      }>
        <Route index                    element={<HomePage />} />
        <Route path="user/:sam"         element={<UserPage />} />
        <Route path="computer"          element={<ComputerPage />} />
        <Route path="computer/:name"    element={<ComputerPage />} />
        <Route path="docusnap"          element={<DocusnapPage />} />
        <Route path="docusnap/:hostname" element={<DocusnapPage />} />
        <Route path="audit"             element={<AuditPage />} />
        <Route path="topdesk"           element={<div className="p-4 text-sm" style={{ color: "var(--text-muted)" }}>TopDesk — kommt bald</div>} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
