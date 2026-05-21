import { useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Shield, Eye, EyeOff, Loader2 } from "lucide-react";

export default function LoginPage() {
  const { login }               = useAuth();
  const navigate                = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(username, password);
      navigate("/");
    } catch (err) {
      setError(err.message || "Anmeldung fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4"
         style={{ backgroundColor: "var(--bg-secondary)" }}>

      {/* Hintergrund-Akzent */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full opacity-10"
             style={{ background: "radial-gradient(circle, var(--brand) 0%, transparent 70%)" }} />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full opacity-10"
             style={{ background: "radial-gradient(circle, var(--brand) 0%, transparent 70%)" }} />
      </div>

      {/*
        BUG 2 FIX: Edge und Chrome rendern ein eigenes Auge-Icon bei type="password".
        Wir unterdrücken es global per CSS-Injection für dieses Element.
        Die Klasse "pw-input" wird unten am <input> gesetzt.
      */}
      <style>{`
        .pw-input::-ms-reveal,
        .pw-input::-ms-clear,
        .pw-input::-webkit-contacts-auto-fill-button,
        .pw-input::-webkit-credentials-auto-fill-button { display: none !important; }
      `}</style>

      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 shadow-panel"
               style={{ backgroundColor: "var(--brand)" }}>
            <Shield className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight"
              style={{ color: "var(--text-primary)" }}>
            AD-Manager
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
            Melde dich mit deinem Domänenkonto an
          </p>
        </div>

        {/* Formular */}
        <div className="card p-6 space-y-4">
          {error && (
            <div className="rounded-lg px-4 py-3 text-sm"
                 style={{ backgroundColor: "var(--danger-light)", color: "var(--danger)" }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
                Benutzername
              </label>
              <input
                className="input"
                type="text"
                placeholder="admin.ituser"
                value={username}
                onChange={e => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
                Passwort
              </label>
              <div className="relative">
                <input
                  className="input pr-10 pw-input"
                  type={showPw ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: "var(--text-muted)" }}>
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full justify-center mt-2">
              {loading
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Anmelden…</>
                : "Anmelden"
              }
            </button>
          </form>
        </div>

        <p className="text-center text-xs mt-6" style={{ color: "var(--text-muted)" }}>
          Musterstadt · IT-Administration
        </p>
      </div>
    </div>
  );
}
