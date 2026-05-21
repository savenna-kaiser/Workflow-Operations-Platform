import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  User, Unlock, KeyRound, PowerOff, Power, Edit2,
  Monitor, Clock, Wifi, WifiOff, Plus, Minus,
  Loader2, AlertCircle, ChevronLeft, RefreshCw,
  CheckCircle, XCircle,
} from "lucide-react";

// Parst deutsches Datumsformat "DD.MM.YYYY HH:MM" → Date-Objekt
function parseGermanDate(str) {
  if (!str) return null;
  const [date, time] = str.split(" ");
  const [d, m, y] = date.split(".");
  return new Date(`${y}-${m}-${d}T${time || "00:00"}`);
}

import { users, citrix } from "../api/client";
import { useAuth } from "../hooks/useAuth";
import EditUserModal, { ResetPwModal, AddGroupModal } from "../components/user/EditUserModal";

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

function hasPermission(user, perm) {
  const perms = {
    helpdesk:  ["user:search","user:unlock","user:reset-password","user:read-groups"],
    "it-admin":["user:search","user:unlock","user:reset-password","user:read-groups",
                "user:enable","user:disable","user:edit","user:add-group","user:remove-group"],
    "it-lead": ["user:search","user:unlock","user:reset-password","user:read-groups",
                "user:enable","user:disable","user:edit","user:add-group","user:remove-group"],
  };
  return (perms[user?.role] || []).includes(perm);
}

function StatusBadge({ enabled }) {
  return enabled
    ? <span className="badge badge-success flex items-center gap-1"><CheckCircle className="w-3 h-3" />Aktiv</span>
    : <span className="badge badge-danger flex items-center gap-1"><XCircle className="w-3 h-3" />Deaktiviert</span>;
}

function SessionStateBadge({ state }) {
  const map = {
    active:       { cls: "badge-success", label: "Aktiv" },
    disconnected: { cls: "badge-warning", label: "Getrennt" },
  };
  const s = map[state?.toLowerCase()] || { cls: "badge-neutral", label: state || "–" };
  return <span className={`badge ${s.cls}`}>{s.label}</span>;
}

// ─── Komponente ───────────────────────────────────────────────────────────────

export default function UserPage() {
  const { sam }    = useParams();
  const navigate   = useNavigate();
  const { user: me } = useAuth();

  const [userData,    setUserData]    = useState(null);
  const [groups,      setGroups]      = useState([]);
  const [session,     setSession]     = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState("");
  const [actionMsg,   setActionMsg]   = useState(null);
  const [actionLoading, setActionLoading] = useState("");

  // Modals
  const [showEdit,    setShowEdit]    = useState(false);
  const [showPw,      setShowPw]      = useState(false);
  const [showGroup,   setShowGroup]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [searchRes, groupRes, sessionRes] = await Promise.allSettled([
        users.search(sam),
        users.getGroups(sam),
        citrix.sessionForUser(sam),
      ]);

      if (searchRes.status === "fulfilled") {
        const found = searchRes.value.results?.find(
          u => u.SamAccountName?.toLowerCase() === sam.toLowerCase()
        );
        if (found) setUserData(found);
        else setError(`Benutzer '${sam}' nicht gefunden.`);
      }

      if (groupRes.status === "fulfilled") setGroups(groupRes.value.groups || []);
      if (sessionRes.status === "fulfilled") setSession(sessionRes.value.session);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [sam]);

  useEffect(() => { load(); }, [load]);

  // Keyboard: / öffnet Suche (wird im AppShell behandelt)
  useEffect(() => {
    const h = (e) => {
      if (e.key === "/" && document.activeElement.tagName !== "INPUT") {
        e.preventDefault();
        document.querySelector("[data-search-trigger]")?.click();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const doAction = async (label, fn) => {
    setActionLoading(label); setActionMsg(null);
    try {
      await fn();
      setActionMsg({ type: "success", text: `${label} erfolgreich.` });
      await load();
    } catch (err) {
      setActionMsg({ type: "error", text: err.message });
    } finally {
      setActionLoading("");
    }
  };

  const removeGroup = (dn) => doAction("Gruppe entfernen", () => users.removeGroup(sam, dn));

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--brand)" }} />
    </div>
  );

  if (error) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <AlertCircle className="w-8 h-8" style={{ color: "var(--danger)" }} />
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{error}</p>
      <button onClick={() => navigate(-1)} className="btn-secondary text-sm">
        <ChevronLeft className="w-4 h-4" /> Zurück
      </button>
    </div>
  );

  if (!userData) return null;

  const canEdit   = hasPermission(me, "user:edit");
  const canAction = hasPermission(me, "user:enable");

  return (
    <div className="max-w-5xl mx-auto space-y-4">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-muted)" }}>
        <button onClick={() => navigate("/")} className="hover:underline">Benutzer</button>
        <span>/</span>
        <span style={{ color: "var(--text-primary)" }}>{userData.DisplayName || userData.SamAccountName}</span>
        <button onClick={load} className="ml-auto" title="Aktualisieren">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Aktions-Feedback */}
      {actionMsg && (
        <div className={`rounded-lg px-4 py-3 text-sm flex items-center gap-2 ${
          actionMsg.type === "success" ? "badge-success" : ""
        }`} style={actionMsg.type === "error" ? {
          backgroundColor: "var(--danger-light)", color: "var(--danger)"
        } : { backgroundColor: "#dcfce7", color: "#15803d" }}>
          {actionMsg.type === "success"
            ? <CheckCircle className="w-4 h-4 shrink-0" />
            : <AlertCircle className="w-4 h-4 shrink-0" />}
          {actionMsg.text}
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">

        {/* ── Linke Spalte: Basisdaten + Aktionen ─────────────────────── */}
        <div className="col-span-2 space-y-4">

          {/* User-Header */}
          <div className="card p-5">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-semibold text-white shrink-0"
                   style={{ backgroundColor: userData.Enabled ? "var(--brand)" : "var(--text-muted)" }}>
                {(userData.DisplayName || userData.SamAccountName)?.[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                    {userData.DisplayName || userData.SamAccountName}
                  </h1>
                  <StatusBadge enabled={userData.Enabled} />
                </div>
                <p className="text-sm font-mono mt-0.5" style={{ color: "var(--text-muted)" }}>
                  {userData.SamAccountName}
                </p>
                {userData.DistinguishedName && (
                  <p className="text-xs mt-1 truncate" style={{ color: "var(--text-muted)" }}>
                    {userData.DistinguishedName}
                  </p>
                )}
              </div>
              {canEdit && (
                <button onClick={() => setShowEdit(true)} className="btn-secondary">
                  <Edit2 className="w-4 h-4" /> Bearbeiten
                </button>
              )}
            </div>
          </div>

          {/* Aktionen */}
          <div className="card p-4">
            <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--text-secondary)" }}>
              Aktionen
            </h2>
            <div className="flex flex-wrap gap-2">
              <button
                disabled={!!actionLoading || !hasPermission(me, "user:unlock")}
                onClick={() => doAction("Entsperren", () => users.unlock(sam))}
                className="btn-secondary text-sm disabled:opacity-40">
                {actionLoading === "Entsperren"
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Unlock className="w-4 h-4" />}
                Entsperren
              </button>

              <button
                disabled={!!actionLoading || !hasPermission(me, "user:reset-password")}
                onClick={() => setShowPw(true)}
                className="btn-secondary text-sm disabled:opacity-40">
                <KeyRound className="w-4 h-4" /> Passwort zurücksetzen
              </button>

              {canAction && userData.Enabled && (
                <button
                  disabled={!!actionLoading}
                  onClick={() => doAction("Deaktivieren", () => users.disable(sam))}
                  className="btn-danger text-sm disabled:opacity-40">
                  {actionLoading === "Deaktivieren"
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <PowerOff className="w-4 h-4" />}
                  Deaktivieren
                </button>
              )}

              {canAction && !userData.Enabled && (
                <button
                  disabled={!!actionLoading}
                  onClick={() => doAction("Aktivieren", () => users.enable(sam))}
                  className="btn-primary text-sm disabled:opacity-40">
                  {actionLoading === "Aktivieren"
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Power className="w-4 h-4" />}
                  Aktivieren
                </button>
              )}
            </div>
          </div>

          {/* Gruppen */}
          <div className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>
                Gruppen ({groups.length})
              </h2>
              {hasPermission(me, "user:add-group") && (
                <button onClick={() => setShowGroup(true)} className="btn-secondary text-xs py-1">
                  <Plus className="w-3 h-3" /> Hinzufügen
                </button>
              )}
            </div>

            {groups.length === 0
              ? <p className="text-sm" style={{ color: "var(--text-muted)" }}>Keine Gruppen</p>
              : (
                <ul className="space-y-1 max-h-64 overflow-y-auto">
                  {groups.map((g, i) => (
                    <li key={i}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm"
                        style={{ backgroundColor: "var(--bg-subtle)" }}>
                      <span className="flex-1 truncate font-mono text-xs"
                            style={{ color: "var(--text-primary)" }}
                            title={g.DistinguishedName}>
                        {g.Name || g.SamAccountName}
                      </span>
                      {hasPermission(me, "user:remove-group") && (
                        <button
                          onClick={() => removeGroup(g.DistinguishedName)}
                          className="shrink-0 opacity-40 hover:opacity-100 transition-opacity"
                          style={{ color: "var(--danger)" }}
                          title="Gruppe entfernen">
                          <Minus className="w-3 h-3" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
          </div>
        </div>

        {/* ── Rechte Spalte: Citrix-Session ───────────────────────────── */}
        <div className="space-y-4">
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-3">
              <Monitor className="w-4 h-4" style={{ color: "var(--brand)" }} />
              <h2 className="text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>
                Citrix Session
              </h2>
            </div>

            {session ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>Status</span>
                  <SessionStateBadge state={session.sessionState} />
                </div>

                <div className="space-y-2 text-sm">
                  {session.clientName && (
                    <div>
                      <p className="text-xs mb-0.5" style={{ color: "var(--text-muted)" }}>Arbeitsplatz</p>
                      <button
                        onClick={() => navigate(`/computer/${session.clientName}`)}
                        className="font-mono text-xs hover:underline"
                        style={{ color: "var(--brand)" }}>
                        {session.clientName}
                      </button>
                    </div>
                  )}

                  {session.machineName && (
                    <div>
                      <p className="text-xs mb-0.5" style={{ color: "var(--text-muted)" }}>Citrix-Server</p>
                      <p className="font-mono text-xs" style={{ color: "var(--text-primary)" }}>
                        {session.machineName}
                      </p>
                    </div>
                  )}

                  {session.sessionStart && (
                    <div>
                      <p className="text-xs mb-0.5" style={{ color: "var(--text-muted)" }}>
                        <Clock className="w-3 h-3 inline mr-1" />Angemeldet seit
                      </p>
                      <p className="text-xs" style={{ color: "var(--text-primary)" }}>
                        {parseGermanDate(session.sessionStart)?.toLocaleString("de-DE") ?? "–"}
                      </p>
                    </div>
                  )}

                  {session.protocol && (
                    <div className="flex items-center gap-1">
                      {session.sessionState?.toLowerCase() === "active"
                        ? <Wifi className="w-3 h-3" style={{ color: "var(--success)" }} />
                        : <WifiOff className="w-3 h-3" style={{ color: "var(--text-muted)" }} />}
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                        {session.protocol}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-6">
                <Monitor className="w-8 h-8 mx-auto mb-2 opacity-20" style={{ color: "var(--text-muted)" }} />
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>Keine aktive Session</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      {showEdit && (
        <EditUserModal
          user={userData}
          onClose={() => setShowEdit(false)}
          onSave={async (changes) => {
            await doAction("Bearbeiten", () => users.edit(sam, changes));
            setShowEdit(false);
          }}
        />
      )}

      {showPw && (
        <ResetPwModal
          sam={sam}
          onClose={() => setShowPw(false)}
          onSave={async (body) => {
            await doAction("Passwort zurücksetzen", () => users.resetPassword(sam, body));
            setShowPw(false);
          }}
        />
      )}

      {showGroup && (
        <AddGroupModal
          sam={sam}
          onClose={() => setShowGroup(false)}
          onAdd={async (groupDn) => {
            await doAction("Gruppe hinzufügen", () => users.addGroup(sam, groupDn));
            setShowGroup(false);
          }}
        />
      )}
    </div>
  );
}
