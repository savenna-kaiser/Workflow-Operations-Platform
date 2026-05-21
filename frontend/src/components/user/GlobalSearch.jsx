import { useState, useEffect, useRef } from "react";
import { Search, Monitor, Loader2, X } from "lucide-react";
import { users, computers } from "../../api/client";

export default function GlobalSearch({ onClose, onSelect }) {
  const [query, setQuery]     = useState("");
  const [results, setResults] = useState({ users: [], computers: [] });
  const [loading, setLoading] = useState(false);
  const [active, setActive]   = useState(0);
  const inputRef              = useRef(null);
  const timerRef              = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    if (query.length < 2) { setResults({ users: [], computers: [] }); return; }
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const [userRes, compRes] = await Promise.allSettled([
          users.search(query),
          computers.search(query),
        ]);
        setResults({
          users:     userRes.status === "fulfilled" ? (userRes.value.results  || []) : [],
          computers: compRes.status === "fulfilled" ? (compRes.value.results  || []) : [],
        });
        setActive(0);
      } catch { setResults({ users: [], computers: [] }); }
      finally { setLoading(false); }
    }, 300);
  }, [query]);

  const allResults = [
    ...results.users.map(u     => ({ type: "user",     id: u.SamAccountName, label: u.DisplayName || u.SamAccountName, sub: u.SamAccountName,      enabled: u.Enabled })),
    ...results.computers.map(c => ({ type: "computer", id: c.Name,           label: c.Name,                            sub: c.DistinguishedName,    enabled: c.Enabled })),
  ];

  const handleKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(a => Math.min(a + 1, allResults.length - 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    if (e.key === "Enter" && allResults[active]) onSelect(allResults[active].type, allResults[active].id);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4"
         style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
         onClick={(e) => e.target === e.currentTarget && onClose()}>

      <div className="w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden"
           style={{ backgroundColor: "var(--bg-primary)", border: "1px solid var(--border)" }}>

        <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
          {loading
            ? <Loader2 className="w-5 h-5 animate-spin shrink-0" style={{ color: "var(--brand)" }} />
            : <Search className="w-5 h-5 shrink-0" style={{ color: "var(--text-muted)" }} />}
          <input
            ref={inputRef}
            className="flex-1 text-sm bg-transparent outline-none"
            style={{ color: "var(--text-primary)" }}
            placeholder="Benutzer oder Computer suchen..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKey}
          />
          <button onClick={onClose} style={{ color: "var(--text-muted)" }}><X className="w-4 h-4" /></button>
        </div>

        {allResults.length > 0 && (
          <ul className="max-h-80 overflow-y-auto py-1">
            {results.users.length > 0 && (
              <li className="px-4 py-1.5 text-xs font-semibold"
                  style={{ color: "var(--text-muted)", backgroundColor: "var(--bg-subtle)" }}>Benutzer</li>
            )}
            {results.users.map((u, i) => (
              <li key={u.SamAccountName}>
                <button onClick={() => onSelect("user", u.SamAccountName)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left"
                  style={{ backgroundColor: i === active ? "var(--bg-subtle)" : "transparent" }}
                  onMouseEnter={() => setActive(i)}>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0"
                       style={{ backgroundColor: u.Enabled ? "var(--brand)" : "var(--text-muted)" }}>
                    {(u.DisplayName || u.SamAccountName)?.[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>{u.DisplayName || u.SamAccountName}</p>
                    <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>{u.SamAccountName}</p>
                  </div>
                  {!u.Enabled && <span className="badge badge-danger text-xs">Deaktiviert</span>}
                </button>
              </li>
            ))}

            {results.computers.length > 0 && (
              <li className="px-4 py-1.5 text-xs font-semibold"
                  style={{ color: "var(--text-muted)", backgroundColor: "var(--bg-subtle)" }}>Computer</li>
            )}
            {results.computers.map((c, i) => {
              const idx = results.users.length + i;
              return (
                <li key={c.Name}>
                  <button onClick={() => onSelect("computer", c.Name)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left"
                    style={{ backgroundColor: idx === active ? "var(--bg-subtle)" : "transparent" }}
                    onMouseEnter={() => setActive(idx)}>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                         style={{ backgroundColor: c.Enabled ? "var(--brand)" : "var(--text-muted)" }}>
                      <Monitor className="w-4 h-4 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium font-mono truncate" style={{ color: "var(--text-primary)" }}>{c.Name}</p>
                      <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>{c.DistinguishedName}</p>
                    </div>
                    {!c.Enabled && <span className="badge badge-danger text-xs">Deaktiviert</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {query.length >= 2 && !loading && allResults.length === 0 && (
          <div className="px-4 py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
            Keine Ergebnisse fuer "{query}"
          </div>
        )}
        {query.length < 2 && (
          <div className="px-4 py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
            Mindestens 2 Zeichen eingeben
          </div>
        )}

        <div className="flex items-center gap-4 px-4 py-2 border-t text-xs"
             style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
          <span>Pfeiltasten navigieren</span>
          <span>Enter oeffnen</span>
          <span>Esc schliessen</span>
        </div>
      </div>
    </div>
  );
}
