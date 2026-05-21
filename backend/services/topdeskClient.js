/**
 * topdeskClient.js – TopDesk REST-API-Client
 *
 * Liest Change-Requests aus TopDesk:
 *   - Eintritte  (Neuzugang AD-Konto anlegen)
 *   - Austritte  (Konto deaktivieren)
 *   - Abteilungswechsel (OU + Gruppen anpassen)
 *
 * Authentifizierung: HTTP Basic mit Application Password
 * (in TopDesk: Einstellungen → Operators → Application Passwords)
 *
 * Doku: https://developers.topdesk.com/explorer/?page=change-management
 */

const https  = require("https");
const http   = require("http");
const { URL } = require("url");

const BASE_URL = process.env.TOPDESK_URL      || "https://your-instance.topdesk.net";
const USERNAME = process.env.TOPDESK_USERNAME || "";
const PASSWORD = process.env.TOPDESK_APP_PASSWORD || "";

// TopDesk Change-Typen – passe die Werte an deine TopDesk-Konfiguration an
const CHANGE_CATEGORIES = {
  EINTRITT:    process.env.TOPDESK_CAT_EINTRITT    || "Eintritt",
  AUSTRITT:    process.env.TOPDESK_CAT_AUSTRITT     || "Austritt",
  ABT_WECHSEL: process.env.TOPDESK_CAT_ABTW        || "Abteilungswechsel",
};

// ─── Interner HTTP-Client ────────────────────────────────────────────────────

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url    = new URL(path, BASE_URL);
    const auth   = Buffer.from(`${USERNAME}:${PASSWORD}`).toString("base64");
    const isHttps = url.protocol === "https:";
    const lib    = isHttps ? https : http;

    const options = {
      hostname: url.hostname,
      port:     url.port || (isHttps ? 443 : 80),
      path:     url.pathname + url.search,
      method,
      headers: {
        "Authorization": `Basic ${auth}`,
        "Accept":        "application/json",
        "Content-Type":  "application/json",
      },
    };

    const req = lib.request(options, (res) => {
      let data = "";
      res.on("data", chunk => { data += chunk; });
      res.on("end", () => {
        if (res.statusCode >= 400) {
          return reject(new Error(`TopDesk API ${res.statusCode}: ${data.slice(0, 200)}`));
        }
        try {
          resolve(data ? JSON.parse(data) : {});
        } catch {
          resolve(data);
        }
      });
    });

    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ─── API-Funktionen ──────────────────────────────────────────────────────────

/**
 * Holt alle offenen Change-Requests eines bestimmten Typs.
 *
 * TopDesk Change Management API:
 *   GET /tas/api/operatorChanges?$filter=category eq 'Eintritt' and status eq 'In Bearbeitung'
 *
 * @param {"EINTRITT"|"AUSTRITT"|"ABT_WECHSEL"} type
 * @param {object} [opts]
 * @param {string} [opts.status]  – TopDesk-Status-Filter, default "In Bearbeitung"
 * @param {number} [opts.limit]   – max. Einträge, default 50
 */
async function getChanges(type, { status = "In Bearbeitung", limit = 50 } = {}) {
  const category = CHANGE_CATEGORIES[type];
  if (!category) throw new Error(`Unbekannter Change-Typ: ${type}`);

  const filter = encodeURIComponent(
    `category eq '${category}' and status eq '${status}'`
  );
  const path = `/tas/api/operatorChanges?$filter=${filter}&pageSize=${limit}`;

  const result = await request("GET", path);
  // TopDesk gibt { results: [...], pageSize, ... } zurück
  return result.results || result || [];
}

/**
 * Holt einen einzelnen Change-Request inkl. aller Custom-Felder.
 * Custom-Felder (z.B. "Vorname", "SAM-Account", "Ziel-OU") musst du
 * einmalig in TopDesk konfigurieren.
 */
async function getChangeById(changeId) {
  return request("GET", `/tas/api/operatorChanges/${changeId}`);
}

/**
 * Setzt den Status eines Change-Requests.
 * Typische Werte: "Abgeschlossen", "Fehlgeschlagen"
 */
async function updateChangeStatus(changeId, status, progressNote = "") {
  return request("PUT", `/tas/api/operatorChanges/${changeId}`, {
    status,
    ...(progressNote ? { progressNotes: progressNote } : {}),
  });
}

/**
 * Fügt einen Fortschrittshinweis zu einem Change hinzu.
 */
async function addProgressNote(changeId, note) {
  return request("POST",
    `/tas/api/operatorChanges/${changeId}/progressNotes`,
    { progressNotes: note }
  );
}

// ─── Payload-Normalisierer ───────────────────────────────────────────────────
// Wandelt einen TopDesk-Change in das interne Format um.
// Passe die Feldnamen an deine TopDesk-Instanz an (Custom-Felder-Mapping).

function normalizeEintritt(change) {
  const f = change.optionalFields1 || {};   // Custom-Felder TopDesk Tab "Zusatzfelder 1"
  return {
    changeId:    change.number,
    type:        "EINTRITT",
    firstName:   f.text1  || change.briefDescription?.split(" ")[0] || "",
    lastName:    f.text2  || "",
    username:    f.text3  || "",          // gewünschter SAM-Account
    department:  f.text4  || "",
    targetOU:    f.text5  || "",          // Ziel-OU in AD
    startDate:   f.date1  || "",
    email:       f.text6  || "",
    phoneNumber: f.text7  || "",
    groups:      (f.text8 || "").split(",").map(g => g.trim()).filter(Boolean),
  };
}

function normalizeAustritt(change) {
  const f = change.optionalFields1 || {};
  return {
    changeId:  change.number,
    type:      "AUSTRITT",
    username:  f.text1 || "",            // SAM-Account
    leaveDate: f.date1 || "",
    reason:    f.text2 || "",
  };
}

function normalizeAbteilungswechsel(change) {
  const f = change.optionalFields1 || {};
  return {
    changeId:     change.number,
    type:         "ABT_WECHSEL",
    username:     f.text1 || "",
    oldOU:        f.text2 || "",
    newOU:        f.text3 || "",
    newDepartment:f.text4 || "",
    groupsToAdd:  (f.text5 || "").split(",").map(g => g.trim()).filter(Boolean),
    groupsToRemove:(f.text6|| "").split(",").map(g => g.trim()).filter(Boolean),
    changeDate:   f.date1 || "",
  };
}

// ─── Export ──────────────────────────────────────────────────────────────────

module.exports = {
  getChanges,
  getChangeById,
  updateChangeStatus,
  addProgressNote,
  normalizeEintritt,
  normalizeAustritt,
  normalizeAbteilungswechsel,
  CHANGE_CATEGORIES,
};
