import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  ClipboardList, Search, X, ChevronLeft, ChevronRight,
  Download, RefreshCw, Loader2, AlertCircle,
  CheckCircle, XCircle, Shield, Monitor, Users,
  Filter, Calendar,
} from "lucide-react";
import { audit } from "../api/client";
import { useAuth } from "../hooks/useAuth";

// ─── Konstanten ───────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

const RESULT_STYLES = {
  success: { color: "#16a34a", bg: "#dcfce7", icon: CheckCircle, label: "Erfolg"    },
  failure: { color: "#dc2626", bg: "#fee2e2", icon: XCircle,     label: "Fehler"    },
};

const ACTION_ICONS = {
  AUTH:     Shield,
  USER:     Users,
  COMPUTER: Monitor,
  GROUP:    Users,
  default:  ClipboardList,
};

function getActionIcon(action = "") {
  if (action.startsWith("AUTH"))     return ACTION_ICONS.AUTH;
  if (action.startsWith("USER") || action.startsWith("GROUP")) return ACTION_ICONS.USER;
  if (action.startsWith("COMPUTER")) return ACTION_ICONS.COMPUTER;
  return ACTION_ICONS.default;
}

function actionLabel(action = "") {
  return action.replace(/_/g, " ").replace(/^(AUTH|USER|COMPUTER|GROUP) /, "");
}

function formatTs(ts) {
  if (!ts) return "–";
  try {
    return new Date(ts).toLocaleString("de-DE", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  } catch { return ts; }
}

// ─── Filter-Panel ─────────────────────────────────────────────────────────────

function FilterPanel({ filters, setFilters, meta, onReset, canSeeAll }) {
  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4" style={{ color: "var(--brand)" }} />
          <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Filter</span>
        </div>
        <button onClick={onReset} className="text-xs" style={{ color: "var(--text-muted)" }}>
          Zurücksetzen
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {/* Freitext */}
        <div className="col-span-2 sm:col-span-1 lg:col-span-2 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
                  style={{ color: "var(--text-muted)" }} />
          <input
            className="input pl-8 text-sm"
            placeholder="Freitext…"
            value={filters.q}
            onChange={e => setFilters(f => ({ ...f, q: e.target.value, page: 1 }))}
          />
        </div>

        {/* Aktion */}
        <select
          className="input text-sm"
          value={filters.action}
          onChange={e => setFilters(f => ({ ...f, action: e.target.value, page: 1 }))}>
          <option value="">Alle Aktionen</option>
          {meta.actions.map(a => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>

        {/* Ergebnis */}
        <select
          className="input text-sm"
          value={filters.result}
          onChange={e => setFilters(f => ({ ...f, result: e.target.value, page: 1 }))}>
          <option value="">Alle Ergebnisse</option>
          <option value="success">Erfolg</option>
          <option value="failure">Fehler</option>
        </select>

        {/* Benutzer (nur it-admin/it-lead) */}
        {canSeeAll && (
          <select
            className="input text-sm"
            value={filters.actor}
            onChange={e => setFilters(f => ({ ...f, actor: e.target.value, page: 1 }))}>
            <option value="">Alle Benutzer</option>
            {meta.actors.map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        )}

        {/* Ziel */}
        <div className="relative">
          <input
            className="input text-sm"
            placeholder="Ziel…"
            value={filters.target}
            onChange={e => setFilters(f => ({ ...f, target: e.target.value, page: 1 }))}
          />
        </div>
      </div>

      {/* Datum */}
      <div className="flex items-center gap-3">
        <Calendar className="w-4 h-4 shrink-0" style={{ color: "var(--text-muted)" }} />
        <input
          type="date"
          className="input text-sm"
          value={filters.dateFrom}
          onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value, page: 1 }))}
          style={{ maxWidth: "160px" }}
        />
        <span className="text-sm" style={{ color: "var(--text-muted)" }}>bis</span>
        <input
          type="date"
          className="input text-sm"
          value={filters.dateTo}
          onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value, page: 1 }))}
          style={{ maxWidth: "160px" }}
        />
        {(filters.dateFrom || filters.dateTo) && (
          <button
            onClick={() => setFilters(f => ({ ...f, dateFrom: "", dateTo: "", page: 1 }))}
            style={{ color: "var(--text-muted)" }}>
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Pagination ───────────────────────────────────────────────────────────────

function Pagination({ page, pages, total, pageSize, onChange }) {
  if (pages <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to   = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between px-1">
      <span className="text-xs" style={{ color: "var(--text-muted)" }}>
        {from}–{to} von {total} Einträgen
      </span>
      <div className="flex items-center gap-1">
        <button
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          className="w-8 h-8 flex items-center justify-center rounded-lg border transition-colors disabled:opacity-30"
          style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
          <ChevronLeft className="w-4 h-4" />
        </button>
        {/* Seitenzahlen */}
        {Array.from({ length: Math.min(7, pages) }, (_, i) => {
          let p;
          if (pages <= 7) p = i + 1;
          else if (page <= 4) p = i + 1;
          else if (page >= pages - 3) p = pages - 6 + i;
          else p = page - 3 + i;
          return (
            <button key={p} onClick={() => onChange(p)}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-sm transition-colors"
              style={{
                backgroundColor: p === page ? "var(--brand)" : "transparent",
                color:           p === page ? "white" : "var(--text-muted)",
                border:          p === page ? "none" : "1px solid var(--border)",
              }}>
              {p}
            </button>
          );
        })}
        <button
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
          className="w-8 h-8 flex items-center justify-center rounded-lg border transition-colors disabled:opacity-30"
          style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ─── Haupt-Komponente ─────────────────────────────────────────────────────────

const EMPTY_FILTERS = {
  q: "", actor: "", action: "", target: "", result: "",
  dateFrom: "", dateTo: "", page: 1,
};

export default function AuditPage() {
  const navigate        = useNavigate();
  const { user: me }    = useAuth();
  const canSeeAll       = me?.role === "it-admin" || me?.role === "it-lead";
  const canExport       = me?.role === "it-lead";

  const [filters,  setFilters]  = useState(EMPTY_FILTERS);
  const [data,     setData]     = useState({ entries: [], total: 0, page: 1, pages: 0, pageSize: PAGE_SIZE });
  const [meta,     setMeta]     = useState({ actions: [], actors: [] });
  const [loading,  setLoading]  = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error,    setError]    = useState(null);

  // ── Meta laden ──────────────────────────────────────────────────────────────
  useEffect(() => {
    audit.meta().then(setMeta).catch(() => {});
  }, []);

  // ── Daten laden ─────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = {
        page:     filters.page,
        pageSize: PAGE_SIZE,
        ...(filters.q        && { q:        filters.q }),
        ...(filters.actor    && { actor:    filters.actor }),
        ...(filters.action   && { action:   filters.action }),
        ...(filters.target   && { target:   filters.target }),
        ...(filters.result   && { result:   filters.result }),
        ...(filters.dateFrom && { dateFrom: filters.dateFrom }),
        ...(filters.dateTo   && { dateTo:   filters.dateTo }),
      };
      const res = await audit.get(params);
      setData(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  // ── Export ──────────────────────────────────────────────────────────────────
  const handleExport = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams({
        ...(filters.q        && { q:        filters.q }),
        ...(filters.actor    && { actor:    filters.actor }),
        ...(filters.action   && { action:   filters.action }),
        ...(filters.target   && { target:   filters.target }),
        ...(filters.result   && { result:   filters.result }),
        ...(filters.dateFrom && { dateFrom: filters.dateFrom }),
        ...(filters.dateTo   && { dateTo:   filters.dateTo }),
      });
      const res  = await fetch(`/api/audit/export?${params}`, { credentials: "include" });
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `audit-export-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    } finally {
      setExporting(false); }
  };

  const hasFilters = Object.entries(filters).some(([k, v]) => k !== "page" && v !== "" && v !== 1);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
            Audit-Log
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
            {data.total > 0 ? `${data.total} Einträge gesamt` : "Alle Aktionen werden protokolliert"}
            {!canSeeAll && " · Nur eigene Aktionen"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canExport && (
            <button onClick={handleExport} disabled={exporting} className="btn-secondary text-sm disabled:opacity-40">
              {exporting
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Download className="w-4 h-4" />}
              CSV exportieren
            </button>
          )}
          <button onClick={load} className="btn-secondary text-sm" title="Aktualisieren">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Filter */}
      <FilterPanel
        filters={filters}
        setFilters={setFilters}
        meta={meta}
        canSeeAll={canSeeAll}
        onReset={() => setFilters(EMPTY_FILTERS)}
      />

      {/* Fehler */}
      {error && (
        <div className="rounded-lg px-4 py-3 text-sm flex items-center gap-2"
             style={{ backgroundColor: "var(--danger-light)", color: "var(--danger)" }}>
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {/* Tabelle */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--brand)" }} />
          </div>
        ) : data.entries.length === 0 ? (
          <div className="py-16 text-center">
            <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-20"
                           style={{ color: "var(--text-muted)" }} />
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              {hasFilters ? "Keine Einträge für diese Filter" : "Noch keine Einträge vorhanden"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ backgroundColor: "var(--bg-subtle)", borderBottom: "1px solid var(--border)" }}>
                <tr>
                  {["Zeitstempel", "Benutzer", "Aktion", "Ziel", "Ergebnis", "IP"].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold"
                        style={{ color: "var(--text-muted)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.entries.map((entry) => {
                  const rs      = RESULT_STYLES[entry.result] || RESULT_STYLES.success;
                  const Icon    = rs.icon;
                  const ActIcon = getActionIcon(entry.action);
                  return (
                    <tr key={entry.id}
                        style={{ borderBottom: "1px solid var(--border)" }}
                        className="transition-colors"
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = "var(--bg-subtle)"}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}>

                      {/* Zeitstempel */}
                      <td className="px-4 py-2.5 text-xs whitespace-nowrap font-mono"
                          style={{ color: "var(--text-muted)" }}>
                        {formatTs(entry.ts)}
                      </td>

                      {/* Benutzer */}
                      <td className="px-4 py-2.5">
                        {entry.target_type !== "user" && entry.actor !== entry.target ? (
                          <button
                            onClick={() => navigate(`/user/${entry.actor}`)}
                            className="text-xs font-medium hover:underline"
                            style={{ color: "var(--brand)" }}>
                            {entry.actor}
                          </button>
                        ) : (
                          <span className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
                            {entry.actor}
                          </span>
                        )}
                        {entry.role && (
                          <span className="ml-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
                            ({entry.role})
                          </span>
                        )}
                      </td>

                      {/* Aktion */}
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <ActIcon className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--text-muted)" }} />
                          <span className="text-xs font-mono" style={{ color: "var(--text-primary)" }}>
                            {entry.action}
                          </span>
                        </div>
                      </td>

                      {/* Ziel */}
                      <td className="px-4 py-2.5 text-xs max-w-xs truncate">
                        {entry.target ? (
                          <button
                            onClick={() => {
                              if (entry.target_type === "computer") navigate(`/computer/${entry.target}`);
                              else if (entry.target_type === "user") navigate(`/user/${entry.target}`);
                            }}
                            className={entry.target_type ? "hover:underline" : "cursor-default"}
                            style={{ color: entry.target_type ? "var(--brand)" : "var(--text-primary)" }}>
                            {entry.target}
                          </button>
                        ) : (
                          <span style={{ color: "var(--text-muted)" }}>–</span>
                        )}
                        {entry.target_type && (
                          <span className="ml-1 text-xs" style={{ color: "var(--text-muted)" }}>
                            ({entry.target_type})
                          </span>
                        )}
                      </td>

                      {/* Ergebnis */}
                      <td className="px-4 py-2.5">
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
                              style={{ backgroundColor: rs.bg, color: rs.color }}>
                          <Icon className="w-3 h-3" />
                          {rs.label}
                        </span>
                        {entry.error && (
                          <p className="text-xs mt-0.5 truncate max-w-xs" style={{ color: "var(--danger)" }}
                             title={entry.error}>
                            {entry.error}
                          </p>
                        )}
                      </td>

                      {/* IP */}
                      <td className="px-4 py-2.5 text-xs font-mono"
                          style={{ color: "var(--text-muted)" }}>
                        {entry.ip || "–"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      <Pagination
        page={data.page}
        pages={data.pages}
        total={data.total}
        pageSize={PAGE_SIZE}
        onChange={p => setFilters(f => ({ ...f, page: p }))}
      />
    </div>
  );
}
