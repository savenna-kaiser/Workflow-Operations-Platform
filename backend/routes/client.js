/**
 * api/client.js – Zentraler API-Client
 * Alle Requests gehen über /api (Vite-Proxy → localhost:3000)
 */

const BASE = "/api";

async function request(method, path, body = null) {
  const opts = {
    method,
    credentials: "include",   // Session-Cookie mitschicken
    headers: { "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${BASE}${path}`, opts);

  // 401 → zur Login-Seite
  if (res.status === 401) {
    window.location.href = "/login";
    return;
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg = data.error || `Fehler ${res.status}`;
    throw new Error(msg);
  }

  return data;
}

// ─── Auth ────────────────────────────────────────────────────────────────────
export const auth = {
  login:  (username, password) => request("POST", "/auth/login",  { username, password }),
  logout: ()                   => request("POST", "/auth/logout"),
  me:     ()                   => request("GET",  "/auth/me"),
};

// ─── Users ───────────────────────────────────────────────────────────────────
export const users = {
  search:        (q)                              => request("GET",    `/users/search?q=${encodeURIComponent(q)}`),
  enable:        (sam)                            => request("POST",   `/users/${sam}/enable`),
  disable:       (sam)                            => request("POST",   `/users/${sam}/disable`),
  unlock:        (sam)                            => request("POST",   `/users/${sam}/unlock`),
  resetPassword: (sam, body)                      => request("POST",   `/users/${sam}/reset-password`, body),
  edit:          (sam, changes)                   => request("PUT",    `/users/${sam}/edit`, changes),
  getGroups:     (sam)                            => request("GET",    `/users/${sam}/groups`),
  addGroup:      (sam, groupDn)                   => request("POST",   `/users/${sam}/groups`, { groupDn }),
  removeGroup:   (sam, groupDn)                   => request("DELETE", `/users/${sam}/groups/${encodeURIComponent(groupDn)}`),
};

// ─── Audit ───────────────────────────────────────────────────────────────────
export const audit = {
  get: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request("GET", `/audit${qs ? "?" + qs : ""}`);
  },
};

// ─── Computers ───────────────────────────────────────────────────────────────
export const computers = {
  search:  (q)    => request("GET",  `/computers/search?q=${encodeURIComponent(q)}`),
  enable:  (name) => request("POST", `/computers/${name}/enable`),
  disable: (name) => request("POST", `/computers/${name}/disable`),
};

// ─── Citrix ──────────────────────────────────────────────────────────────────
export const citrix = {
  sessionForUser:   (sam)  => request("GET", `/citrix/session/${sam}`),
  sessionForClient: (name) => request("GET", `/citrix/client/${encodeURIComponent(name)}`),
  activeSessions:   ()     => request("GET", "/citrix/active"),
};

// ─── TopDesk ─────────────────────────────────────────────────────────────────
export const topdesk = {
  pending: () => request("GET",  "/topdesk/pending"),
  process: () => request("POST", "/topdesk/process"),
};