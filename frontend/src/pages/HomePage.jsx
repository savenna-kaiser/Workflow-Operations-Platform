import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Users, Loader2 } from "lucide-react";
import { users } from "../api/client";

export default function HomePage() {
  const [query, setQuery]     = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const navigate = useNavigate();

  const doSearch = async (e) => {
    e?.preventDefault();
    if (query.length < 2) return;
    setLoading(true); setSearched(true);
    try {
      const data = await users.search(query);
      setResults(data.results || []);
    } catch { setResults([]); }
    finally { setLoading(false); }
  };

  return (
    <div className="max-w-3xl mx-auto">

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
          Benutzerverwaltung
        </h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Suche nach Name, Username oder Abteilung
        </p>
      </div>

      {/* Suchfeld */}
      <form onSubmit={doSearch} className="flex gap-2 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                  style={{ color: "var(--text-muted)" }} />
          <input
            className="input pl-10"
            placeholder="z.B. Müller, jsmith, IT-Abteilung…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoFocus
          />
        </div>
        <button type="submit" disabled={loading || query.length < 2} className="btn-primary disabled:opacity-40">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Suchen"}
        </button>
      </form>

      {/* Ergebnisse */}
      {searched && !loading && (
        <div className="card overflow-hidden">
          {results.length === 0 ? (
            <div className="py-12 text-center">
              <Users className="w-10 h-10 mx-auto mb-3 opacity-20" style={{ color: "var(--text-muted)" }} />
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                Keine Benutzer für „{query}" gefunden
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", backgroundColor: "var(--bg-subtle)" }}>
                  {["Name", "Username", "Status"].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold"
                        style={{ color: "var(--text-muted)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.map((u, i) => (
                  <tr
                    key={u.SamAccountName || i}
                    onClick={() => navigate(`/user/${u.SamAccountName}`)}
                    className="cursor-pointer transition-colors"
                    style={{ borderBottom: "1px solid var(--border)" }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = "var(--bg-subtle)"}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}>
                    <td className="px-4 py-3 font-medium" style={{ color: "var(--text-primary)" }}>
                      {u.DisplayName || u.SamAccountName}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: "var(--text-muted)" }}>
                      {u.SamAccountName}
                    </td>
                    <td className="px-4 py-3">
                      {u.Enabled
                        ? <span className="badge badge-success">Aktiv</span>
                        : <span className="badge badge-danger">Deaktiviert</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {!searched && (
        <div className="text-center py-16">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-10" style={{ color: "var(--text-primary)" }} />
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Gib einen Suchbegriff ein um Benutzer zu finden
          </p>
        </div>
      )}
    </div>
  );
}
