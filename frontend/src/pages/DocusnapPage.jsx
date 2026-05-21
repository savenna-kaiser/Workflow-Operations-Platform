import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Html5QrcodeScanner } from "html5-qrcode";
import { QRCodeSVG } from "qrcode.react";
import {
  Monitor, Laptop, Package, RefreshCw, Download,
  Printer, Search, X, ChevronDown, AlertCircle,
  CheckCircle, Loader2, BarChart3, List, Filter,
} from "lucide-react";
import { docusnap } from "../api/client";

// ─── Konstanten ──────────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { label: "Neu",          color: "var(--text-muted)" },
  { label: "Aktiv",        color: "#16a34a" },
  { label: "IT-Büro",      color: "#d97706" },
  { label: "Keller",       color: "#d97706" },
  { label: "Unbekannt",    color: "#7c3aed" },
  { label: "Verschrottet", color: "var(--danger)" },
];

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

function getDeviceType(asset) {
  const t = (asset.HostTypeID || "").toLowerCase();
  if (t.includes("notebook") || t.includes("laptop")) return "Notebook";
  if (t.includes("arbeitsstation") || t.includes("desktop")) return "Desktop";
  return "Sonstige";
}

function getWinVersion(asset) {
  const os = (asset.OS || "").toLowerCase();
  if (os.includes("windows 11")) return "Windows 11";
  if (os.includes("windows 10")) return "Windows 10";
  if (os.includes("windows"))    return "Windows (andere)";
  return "Sonstige";
}

function getStatusColor(status) {
  return STATUS_OPTIONS.find(o => o.label === status)?.color || "var(--text-muted)";
}

const EMPTY_FILTERS = { Modell: [], OS: [], Status: [], DeviceType: [], ONC: [] };

// ─── StatCard ────────────────────────────────────────────────────────────────

function StatCard({ label, value, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 px-5 py-4 rounded-xl border transition-all text-left"
      style={{
        backgroundColor: active ? "var(--brand)" : "var(--bg-primary)",
        borderColor:     active ? "var(--brand)" : "var(--border)",
        color:           active ? "white" : "var(--text-primary)",
        boxShadow:       active ? "0 4px 12px color-mix(in srgb, var(--brand) 30%, transparent)" : "none",
        minWidth: "110px",
      }}>
      <span className="text-2xl font-bold tabular-nums">{value}</span>
      <span className="text-xs text-center leading-tight" style={{ color: active ? "rgba(255,255,255,0.8)" : "var(--text-muted)" }}>
        {label}
      </span>
    </button>
  );
}

// ─── Übersicht ───────────────────────────────────────────────────────────────

function OverviewTab({ assets, onFilterAndSwitch }) {
  const total = assets.length;

  const statusGroups = STATUS_OPTIONS.map(s => ({
    ...s,
    count: assets.filter(a => a.Status === s.label).length,
  }));

  const deviceTypes = ["Notebook", "Desktop", "Sonstige"].map(type => ({
    label: type,
    count: assets.filter(a => getDeviceType(a) === type).length,
  }));

  const winVersions = ["Windows 11", "Windows 10", "Windows (andere)", "Sonstige"]
    .map(v => ({ label: v, count: assets.filter(a => getWinVersion(a) === v).length }))
    .filter(v => v.count > 0);

  const oncMap = {};
  assets.forEach(a => { const o = a.ONC || "Unbekannt"; oncMap[o] = (oncMap[o] || 0) + 1; });
  const oncList = Object.entries(oncMap).sort((a, b) => b[1] - a[1]).slice(0, 10);

  const Section = ({ title, children }) => (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
        {title}
      </h3>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );

  return (
    <div className="space-y-8">
      {/* Gesamt */}
      <div className="card p-6 flex items-center gap-6">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center shrink-0"
             style={{ backgroundColor: "var(--brand)" }}>
          <Monitor className="w-8 h-8 text-white" />
        </div>
        <div>
          <p className="text-4xl font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>{total}</p>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>Geräte gesamt</p>
        </div>
      </div>

      <Section title="Status">
        {statusGroups.map(s => (
          <StatCard key={s.label} label={s.label} value={s.count}
            onClick={() => onFilterAndSwitch("Status", s.label)} />
        ))}
      </Section>

      <Section title="Gerätetyp">
        {deviceTypes.map(d => (
          <StatCard key={d.label} label={d.label} value={d.count}
            onClick={() => onFilterAndSwitch("DeviceType", d.label)} />
        ))}
      </Section>

      <Section title="Betriebssystem">
        {winVersions.map(v => (
          <StatCard key={v.label} label={v.label} value={v.count}
            onClick={() => onFilterAndSwitch("OS", v.label)} />
        ))}
      </Section>

      <Section title="Standort / ONC (Top 10)">
        {oncList.map(([onc, count]) => (
          <StatCard key={onc}
            label={onc.length > 22 ? onc.slice(0, 22) + "…" : onc}
            value={count}
            onClick={() => onFilterAndSwitch("ONC", onc)} />
        ))}
      </Section>
    </div>
  );
}

// ─── FilterHeader ─────────────────────────────────────────────────────────────

function FilterHeader({ label, filterKey, options, filters, onToggle, onClear }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const active = filters[filterKey] || [];

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <th className="px-3 py-2.5 text-left text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
      <div ref={ref} className="relative">
        <div className="flex flex-col gap-1">
          <span>{label}</span>
          <button
            onClick={() => setOpen(o => !o)}
            className="flex items-center gap-1 text-xs px-2 py-0.5 rounded border transition-colors"
            style={{
              borderColor: active.length > 0 ? "var(--brand)" : "var(--border)",
              backgroundColor: active.length > 0 ? "color-mix(in srgb, var(--brand) 10%, transparent)" : "var(--bg-subtle)",
              color: active.length > 0 ? "var(--brand)" : "var(--text-muted)",
              width: "fit-content",
            }}>
            <Filter className="w-2.5 h-2.5" />
            {active.length > 0 ? `${active.length} aktiv` : "Alle"}
            <ChevronDown className="w-2.5 h-2.5" />
          </button>
        </div>

        {open && (
          <div className="absolute top-full left-0 mt-1 z-50 rounded-xl shadow-2xl border overflow-hidden"
               style={{ backgroundColor: "var(--bg-primary)", borderColor: "var(--border)", minWidth: "180px" }}>
            <button
              onClick={() => { onClear(filterKey); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-xs border-b transition-colors hover:opacity-80"
              style={{ color: "var(--danger)", borderColor: "var(--border)" }}>
              <X className="w-3 h-3 inline mr-1" /> Auswahl aufheben
            </button>
            <div className="max-h-56 overflow-y-auto py-1">
              {options.map(opt => (
                <label key={opt}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer transition-colors hover:bg-opacity-50"
                  style={{
                    color: "var(--text-primary)",
                    backgroundColor: active.includes(opt) ? "color-mix(in srgb, var(--brand) 8%, transparent)" : "transparent",
                  }}>
                  <input type="checkbox" checked={active.includes(opt)}
                    onChange={() => onToggle(filterKey, opt)}
                    className="rounded" style={{ accentColor: "var(--brand)" }} />
                  {opt}
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
    </th>
  );
}

// ─── QR-Druck ────────────────────────────────────────────────────────────────

function QrPrintView({ onBack }) {
  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6 no-print">
        <button onClick={onBack} className="btn-secondary text-sm">
          <X className="w-4 h-4" /> Schließen
        </button>
        <button onClick={() => window.print()} className="btn-primary text-sm">
          <Printer className="w-4 h-4" /> Drucken
        </button>
      </div>
      <style>{`@media print { .no-print { display: none !important; } }`}</style>
      <div className="flex flex-wrap gap-6">
        {STATUS_OPTIONS.map(opt => (
          <div key={opt.label}
            className="flex flex-col items-center gap-3 p-6 rounded-xl border"
            style={{ borderColor: opt.color, width: "180px", pageBreakInside: "avoid" }}>
            <QRCodeSVG value={opt.label} size={130} />
            <span className="text-sm font-semibold text-center" style={{ color: opt.color }}>
              {opt.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Haupt-Komponente ─────────────────────────────────────────────────────────

export default function DocusnapPage() {
  const { hostname }  = useParams();           // /docusnap/:hostname von ComputerPage
  const navigate      = useNavigate();

  const [assets,       setAssets]       = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [importing,    setImporting]    = useState(false);
  const [actionMsg,    setActionMsg]    = useState(null);
  const [search,       setSearch]       = useState(hostname || "");
  const [filters,      setFilters]      = useState(EMPTY_FILTERS);
  const [tab,          setTab]          = useState(hostname ? "list" : "overview");
  const [showQrPrint,  setShowQrPrint]  = useState(false);
  const [scanningAsset, setScanningAsset] = useState(null);

  // Wenn per URL mit Hostname aufgerufen → Listenansicht mit vorgesetztem Suchwort
  useEffect(() => {
    if (hostname) {
      setSearch(hostname);
      setTab("list");
    }
  }, [hostname]);

  // ── Daten laden ────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await docusnap.assets();
      setAssets(data.assets || []);
    } catch (err) {
      setActionMsg({ type: "error", text: err.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── QR-Scanner ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!scanningAsset) return;
    const scanner = new Html5QrcodeScanner("qr-reader", { fps: 10, qrbox: 250 }, false);
    scanner.render(
      async (decodedText) => {
        try {
          await docusnap.update(scanningAsset.HostName, scanningAsset.BiosSerial, decodedText, undefined);
          setAssets(prev => prev.map(a =>
            a.HostName === scanningAsset.HostName && a.BiosSerial === scanningAsset.BiosSerial
              ? { ...a, Status: decodedText, isNew: false } : a
          ));
          setActionMsg({ type: "success", text: `Status von ${scanningAsset.HostName} auf „${decodedText}" gesetzt.` });
        } catch (err) {
          setActionMsg({ type: "error", text: err.message });
        }
        scanner.clear();
        setScanningAsset(null);
      },
      () => {}
    );
    return () => { scanner.clear().catch(() => {}); };
  }, [scanningAsset]);

  useEffect(() => {
    document.body.style.overflow = scanningAsset ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [scanningAsset]);

  // ── Status direkt ändern ────────────────────────────────────────────────────

  const handleStatusChange = async (asset, newStatus) => {
    try {
      await docusnap.update(asset.HostName, asset.BiosSerial, newStatus, undefined);
      setAssets(prev => prev.map(a =>
        a.HostName === asset.HostName && a.BiosSerial === asset.BiosSerial
          ? { ...a, Status: newStatus, isNew: false } : a
      ));
    } catch (err) {
      setActionMsg({ type: "error", text: err.message });
    }
  };

  // ── Import ──────────────────────────────────────────────────────────────────

  const handleImport = async () => {
    setImporting(true); setActionMsg(null);
    try {
      const result = await docusnap.import();
      setActionMsg({ type: "success", text: `Import abgeschlossen: ${result.added} neu, ${result.updated} aktualisiert.` });
      await load();
    } catch (err) {
      setActionMsg({ type: "error", text: err.message });
    } finally {
      setImporting(false); }
  };

  // ── Filter ──────────────────────────────────────────────────────────────────

  const toggleFilter = (key, value) => {
    setFilters(f => {
      const cur = f[key];
      return { ...f, [key]: cur.includes(value) ? cur.filter(v => v !== value) : [...cur, value] };
    });
  };
  const clearFilter = (key) => setFilters(f => ({ ...f, [key]: [] }));
  const hasFilters  = Object.values(filters).some(v => v.length > 0);

  const uniqueValues = (key) =>
    [...new Set(assets.map(a => a[key]).filter(Boolean))].sort();

  const handleFilterAndSwitch = (key, value) => {
    setFilters({ ...EMPTY_FILTERS, [key]: [value] });
    setSearch("");
    setTab("list");
  };

  // ── Gefilterte Assets ───────────────────────────────────────────────────────

  const filtered = assets.filter(a => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      a.HostName?.toLowerCase().includes(q) ||
      a.Modell?.toLowerCase().includes(q) ||
      a.BiosSerial?.toLowerCase().includes(q) ||
      a.ActiveUser?.toLowerCase().includes(q);
    const matchModell  = !filters.Modell.length     || filters.Modell.includes(a.Modell);
    const matchOS      = !filters.OS.length         || filters.OS.includes(getWinVersion(a));
    const matchStatus  = !filters.Status.length     || filters.Status.includes(a.Status);
    const matchDevice  = !filters.DeviceType.length || filters.DeviceType.includes(getDeviceType(a));
    const matchONC     = !filters.ONC.length        || filters.ONC.includes(a.ONC);
    return matchSearch && matchModell && matchOS && matchStatus && matchDevice && matchONC;
  });

  // ── QR-Druck ────────────────────────────────────────────────────────────────
  if (showQrPrint) return <QrPrintView onBack={() => setShowQrPrint(false)} />;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* QR-Scanner Modal */}
      {scanningAsset && (
        <div onClick={(e) => { if (e.target === e.currentTarget) setScanningAsset(null); }}
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="card p-6 w-80 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
                  QR-Code scannen
                </p>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                  {scanningAsset.HostName} · {scanningAsset.Modell}
                </p>
              </div>
              <button onClick={() => setScanningAsset(null)} style={{ color: "var(--text-muted)" }}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div id="qr-reader" className="rounded-lg overflow-hidden" />
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
            Docusnap Assets
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
            {assets.length} Geräte · {assets.filter(a => a.Status === "Aktiv").length} aktiv
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowQrPrint(true)} className="btn-secondary text-sm">
            <Printer className="w-4 h-4" /> QR-Codes drucken
          </button>
          <button onClick={handleImport} disabled={importing} className="btn-primary text-sm disabled:opacity-40">
            {importing
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Download className="w-4 h-4" />}
            Docusnap importieren
          </button>
          <button onClick={load} className="btn-secondary text-sm" title="Aktualisieren">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Aktions-Feedback */}
      {actionMsg && (
        <div className="rounded-lg px-4 py-3 text-sm flex items-center gap-2"
             style={actionMsg.type === "error"
               ? { backgroundColor: "var(--danger-light)", color: "var(--danger)" }
               : { backgroundColor: "#dcfce7", color: "#15803d" }}>
          {actionMsg.type === "success"
            ? <CheckCircle className="w-4 h-4 shrink-0" />
            : <AlertCircle className="w-4 h-4 shrink-0" />}
          {actionMsg.text}
          <button onClick={() => setActionMsg(null)} className="ml-auto opacity-60 hover:opacity-100">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b" style={{ borderColor: "var(--border)" }}>
        {[
          { key: "overview", label: "Übersicht",  icon: BarChart3 },
          { key: "list",     label: "Geräteliste", icon: List },
        ].map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px"
            style={{
              borderColor:     tab === key ? "var(--brand)" : "transparent",
              color:           tab === key ? "var(--brand)" : "var(--text-muted)",
              backgroundColor: "transparent",
            }}>
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--brand)" }} />
        </div>
      )}

      {/* Übersicht */}
      {!loading && tab === "overview" && (
        <OverviewTab assets={assets} onFilterAndSwitch={handleFilterAndSwitch} />
      )}

      {/* Geräteliste */}
      {!loading && tab === "list" && (
        <div className="space-y-3">
          {/* Suchzeile */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                      style={{ color: "var(--text-muted)" }} />
              <input
                className="input pl-10"
                placeholder="HostName, Modell, ServiceTag, User…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {search && (
                <button onClick={() => { setSearch(""); navigate("/docusnap"); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ color: "var(--text-muted)" }}>
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {hasFilters && (
              <button onClick={() => setFilters(EMPTY_FILTERS)}
                className="btn-secondary text-sm" style={{ color: "var(--danger)", borderColor: "var(--danger)" }}>
                <X className="w-4 h-4" /> Filter zurücksetzen
              </button>
            )}
            <span className="text-sm shrink-0" style={{ color: "var(--text-muted)" }}>
              {filtered.length} / {assets.length}
            </span>
          </div>

          {/* Tabelle */}
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead style={{ backgroundColor: "var(--bg-subtle)", borderBottom: "1px solid var(--border)" }}>
                  <tr>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
                      HostName
                    </th>
                    <FilterHeader label="Modell"  filterKey="Modell"
                      options={uniqueValues("SystemProductName")}
                      filters={filters} onToggle={toggleFilter} onClear={clearFilter} />
                    <th className="px-3 py-2.5 text-left text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
                      Service Tag
                    </th>
                    <FilterHeader label="OS" filterKey="OS"
                      options={["Windows 11", "Windows 10", "Windows (andere)", "Sonstige"]}
                      filters={filters} onToggle={toggleFilter} onClear={clearFilter} />
                    <th className="px-3 py-2.5 text-left text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
                      Letzter Boot
                    </th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
                      User
                    </th>
                    <FilterHeader label="Status" filterKey="Status"
                      options={STATUS_OPTIONS.map(o => o.label)}
                      filters={filters} onToggle={toggleFilter} onClear={clearFilter} />
                    <th className="px-3 py-2.5 text-left text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
                      Aktionen
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-sm"
                          style={{ color: "var(--text-muted)" }}>
                        <Monitor className="w-10 h-10 mx-auto mb-2 opacity-20"
                                 style={{ color: "var(--text-muted)" }} />
                        Keine Geräte gefunden
                      </td>
                    </tr>
                  ) : filtered.map((asset, i) => {
                    const bootDate = asset.LastBootUpTime ? new Date(asset.LastBootUpTime) : null;
                    return (
                      <tr key={`${asset.HostName}-${asset.BiosSerial}-${i}`}
                          style={{
                            borderBottom: "1px solid var(--border)",
                            backgroundColor: asset.isNew
                              ? "color-mix(in srgb, var(--brand) 5%, transparent)"
                              : "transparent",
                          }}>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            {getDeviceType(asset) === "Notebook"
                              ? <Laptop className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--brand)" }} />
                              : <Monitor className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--text-muted)" }} />}
                            <button
                              onClick={() => navigate(`/computer/${asset.HostName}`)}
                              className="font-mono text-xs hover:underline"
                              style={{ color: "var(--brand)" }}>
                              {asset.HostName}
                            </button>
                            {asset.isNew && (
                              <span className="badge text-xs" style={{ backgroundColor: "var(--brand)", color: "white" }}>
                                Neu
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-xs" style={{ color: "var(--text-primary)" }}>
                          {asset.Modell}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs" style={{ color: "var(--text-muted)" }}
                            title={asset.BiosSerial}>
                          {asset.BiosSerial?.slice(0, 12)}{asset.BiosSerial?.length > 12 ? "…" : ""}
                        </td>
                        <td className="px-3 py-2.5 text-xs" style={{ color: "var(--text-primary)" }}>
                          {getWinVersion(asset)}
                        </td>
                        <td className="px-3 py-2.5 text-xs" style={{ color: "var(--text-muted)" }}>
                          {bootDate && !isNaN(bootDate) ? bootDate.toLocaleDateString("de-DE") : "–"}
                        </td>
                        <td className="px-3 py-2.5 text-xs" style={{ color: "var(--text-primary)" }}>
                          {asset.ActiveUser || "–"}
                        </td>
                        <td className="px-3 py-2.5">
                          <select
                            value={asset.Status}
                            onChange={e => handleStatusChange(asset, e.target.value)}
                            className="text-xs px-2 py-1 rounded-lg border-0 font-medium cursor-pointer"
                            style={{
                              backgroundColor: getStatusColor(asset.Status),
                              color: "white",
                            }}>
                            {STATUS_OPTIONS.map(opt => (
                              <option key={opt.label} value={opt.label}>{opt.label}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2.5">
                          <button
                            onClick={() => setScanningAsset(asset)}
                            className="btn-secondary text-xs py-1 px-2">
                            QR-Code
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
