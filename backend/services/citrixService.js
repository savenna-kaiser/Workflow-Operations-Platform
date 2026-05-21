/**
 * citrixService.js – Liest Citrix-Sessions aus der Sessions-CSV
 *
 * Die CSV wird vom Citrix Delivery Controller alle 5 Minuten geschrieben.
 * Format: Tab-separiert, UTF-16 LE mit BOM (typisch für PowerShell Export-Csv).
 *
 * FIXES:
 * - BOM-aware Encoding-Erkennung (UTF-16 LE/BE, UTF-8)
 * - Robustes CSV-Parsing: Spaltenanzahl wird aus Header gezogen,
 *   überzählige Tabs in Werten (z.B. System.String[]) werden toleriert
 * - UserName-Matching: case-insensitiv, "DOMAIN\sam" und "sam" beide supported
 * - ClientName-Matching: case-insensitiv, exakter Vergleich
 * - getDiagnostics(): gibt Rohzeilen + geparste Sessions zurück (nur für Debugging)
 */

const fs   = require("fs");
const path = require("path");

const CSV_PATH     = process.env.AD_SESSIONS_CSV || "";
const CACHE_TTL_MS = 60 * 1000;

let _cache     = null;
let _cacheTime = 0;

// ─── Encoding-Erkennung anhand BOM ───────────────────────────────────────────

function readCSVContent(filePath) {
  const raw = fs.readFileSync(filePath); // Buffer ohne Encoding

  if (raw[0] === 0xFF && raw[1] === 0xFE) {
    return raw.slice(2).toString("utf16le");
  }
  if (raw[0] === 0xFE && raw[1] === 0xFF) {
    // UTF-16 BE – Bytes paarweise tauschen
    const swapped = Buffer.alloc(raw.length - 2);
    for (let i = 0; i < swapped.length; i += 2) {
      swapped[i]     = raw[i + 3];
      swapped[i + 1] = raw[i + 2];
    }
    return swapped.toString("utf16le");
  }
  if (raw[0] === 0xEF && raw[1] === 0xBB && raw[2] === 0xBF) {
    // UTF-8 BOM
    return raw.slice(3).toString("utf8");
  }
  // Kein BOM → UTF-8
  return raw.toString("utf8");
}

// ─── CSV parsen ───────────────────────────────────────────────────────────────
// Die Citrix-CSV hat teils Felder wie "System.String[]" die keine Tabs enthalten,
// aber die Gesamtspaltenzahl kann je nach Citrix-Version variieren.
// Wir schneiden jede Zeile auf genau (headerCount - 1) Tabs zu – alles was
// danach kommt wird dem letzten Feld zugerechnet (ApplicationsInUseList).

function parseCSV(content) {
  const lines = content
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter(l => l.trim().length > 0);

  if (lines.length < 2) return [];

  // Export-Csv umschließt alle Werte mit doppelten Anführungszeichen → strippen
  const stripQuotes = (s) => s.trim().replace(/^"|"$/g, "");
  const headers     = lines[0].split("\t").map(stripQuotes);
  const colCount    = headers.length;
  const maxSplits   = colCount - 1; // Anzahl Tabs die wir aufteilen

  return lines.slice(1).map(line => {
    // Nur maxSplits Tabs aufteilen – Rest bleibt im letzten Feld
    const parts = splitTabsMax(line, maxSplits);
    const obj   = {};
    headers.forEach((h, i) => {
      obj[h] = stripQuotes(parts[i] || "");
    });
    return obj;
  }).filter(row => row.UserName && row.UserName.trim().length > 0);
}

/** Splittet einen String an Tabs, aber maximal `max` Mal */
function splitTabsMax(str, max) {
  const result = [];
  let   start  = 0;
  let   count  = 0;
  for (let i = 0; i < str.length && count < max; i++) {
    if (str[i] === "\t") {
      result.push(str.slice(start, i));
      start = i + 1;
      count++;
    }
  }
  result.push(str.slice(start));
  return result;
}

// ─── Normalisierung ───────────────────────────────────────────────────────────

function normalizeSession(row) {
  return {
    userName:           row.UserName           || "",
    userFullName:       row.UserFullName        || "",
    clientName:         row.ClientName         || "",   // Arbeitsplatz-PC
    machineName:        row.HostedMachineName  || row.MachineName || "", // Citrix-Server (Kurzname bevorzugt)
    machineNameFQDN:    row.DNSName            || "",
    sessionState:       row.SessionState       || "",   // Active, Disconnected
    sessionStart:       row.StartTime          || "",
    sessionStateChange: row.SessionStateChangeTime || "",
    idleSince:          row.IdleSince          || "",
    protocol:           row.Protocol           || "",
    dnsName:            row.DNSName            || "",
    sessionId:          row.SessionId          || "",
    desktopGroupName:   row.DesktopGroupName   || "",
    clientAddress:      row.ClientAddress      || "",
    appState:           row.AppState           || "",
  };
}

// ─── Cache + Laden ────────────────────────────────────────────────────────────

function getSessions() {
  if (_cache && Date.now() - _cacheTime < CACHE_TTL_MS) {
    return _cache;
  }

  if (!CSV_PATH) {
    console.warn("[Citrix] AD_SESSIONS_CSV nicht konfiguriert.");
    return [];
  }

  try {
    const content = readCSVContent(CSV_PATH);
    const rows    = parseCSV(content);
    _cache        = rows.map(normalizeSession);
    _cacheTime    = Date.now();
    console.log(`[Citrix] CSV geladen: ${_cache.length} Sessions`);
    return _cache;
  } catch (err) {
    console.error("[Citrix] CSV lesen fehlgeschlagen:", err.message);
    return _cache || [];
  }
}

// ─── Lookup-Funktionen ────────────────────────────────────────────────────────

/**
 * Gibt die Citrix-Session eines Users zurück (case-insensitiv).
 * Matched sowohl "DOMAIN\sam" als auch nur "sam".
 * Bevorzugt Active vor Disconnected.
 */
function getSessionForUser(samAccountName) {
  const sessions = getSessions();
  const sam      = samAccountName.toLowerCase().trim();

  const matches = sessions.filter(s => {
    const u = s.userName.toLowerCase();
    // "COMPANY\pe03" → sam-Teil nach dem Backslash
    // Normalfall: Backslash vorhanden ("COMPANY\\pe03")
    if (u.includes("\\")) return u.split("\\").pop() === sam;
    // Fallback: Backslash fehlt durch Encoding-Problem
    // z.B. "companyhm.example".endsWith("hm.example") = true
    if (u.endsWith(sam)) return true;
    return u === sam;
  });

  if (matches.length === 0) return null;

  // Active bevorzugen, sonst erste verfügbare
  return matches.find(s => s.sessionState.toLowerCase() === "active")
      || matches[0];
}

/**
 * Gibt die Citrix-Session anhand des Client-PC-Namens zurück (case-insensitiv).
 * ClientName in der CSV ist der Kurzname des Arbeitsplatz-PCs (z.B. "PCORGRT030").
 */
function getSessionForClient(clientName) {
  const sessions = getSessions();
  const name     = clientName.toLowerCase().trim();

  const matches = sessions.filter(s =>
    s.clientName.toLowerCase() === name
  );

  if (matches.length === 0) return null;

  return matches.find(s => s.sessionState.toLowerCase() === "active")
      || matches[0];
}

/**
 * Alle aktiven Sessions (SessionState === "Active").
 */
function getActiveSessions() {
  return getSessions().filter(s =>
    s.sessionState.toLowerCase() === "active"
  );
}

/**
 * Diagnose-Funktion: gibt CSV-Metadaten zurück ohne sensible Daten zu kürzen.
 * Nur für interne Debug-Routen verwenden (RBAC: it-lead).
 */
function getDiagnostics() {
  const sessions   = getSessions();
  const cacheAgeMs = _cacheTime ? Date.now() - _cacheTime : null;
  return {
    csvPath:      CSV_PATH,
    cacheAgeMs,
    cacheAgeSec:  cacheAgeMs !== null ? Math.floor(cacheAgeMs / 1000) : null,
    sessionCount: sessions.length,
    activeSessions: sessions.filter(s => s.sessionState.toLowerCase() === "active").length,
    disconnectedSessions: sessions.filter(s => s.sessionState.toLowerCase() === "disconnected").length,
    // Erste 3 Sessions als Stichprobe (für Header-/Feld-Debugging)
    sample: sessions.slice(0, 3).map(s => ({
      userName:     s.userName,
      userFullName: s.userFullName,
      clientName:   s.clientName,
      machineName:  s.machineName,
      sessionState: s.sessionState,
      sessionStart: s.sessionStart,
    })),
  };
}

module.exports = {
  getSessions,
  getSessionForUser,
  getSessionForClient,
  getActiveSessions,
  getDiagnostics,
};