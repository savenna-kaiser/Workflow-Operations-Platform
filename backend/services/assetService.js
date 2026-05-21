/**
 * assetService.js – Asset-Verwaltung (Docusnap-Integration)
 * Portiert aus der eigenständigen server.js
 */

const fs   = require("fs");
const path = require("path");

const DOCUSNAP_FILE    = process.env.DOCUSNAP_CSV
  || "\\\\epn1docusnap1\\Docusnap_Share\\Export\\Docusnap2Topdesk_Clients.csv";

const DASHBOARD_FILE   = process.env.ASSETS_CSV
  || path.join(__dirname, "../data/assets.csv");

const SEPARATOR = ";";

const COLUMNS = [
  "Key", "HostName", "HostTypeID", "ActiveUser", "OS", "OSArchitecture",
  "BiosSerial", "SystemManufacturer", "LastBootUpTime", "SystemProductName",
  "BuildNumber", "ONC", "Status", "Kommentar", "LetzteAenderung", "isNew",
];

// ─── CSV laden ────────────────────────────────────────────────────────────────

function loadCSV(filePath) {
  return new Promise((resolve) => {
    if (!fs.existsSync(filePath)) return resolve([]);

    try {
      const content  = fs.readFileSync(filePath, "utf8");
      const lines    = content.split(/\r?\n/).filter(Boolean);
      if (lines.length < 2) return resolve([]);

      const firstLine = lines[0];
      const sep       = firstLine.includes(";") ? ";" : "\t";
      const headers   = firstLine.split(sep).map(h => h.replace(/^\uFEFF/, "").replace(/"/g, "").trim());

      const results = lines.slice(1).map(line => {
        const values = line.split(sep);
        const obj    = {};
        headers.forEach((h, i) => { obj[h] = (values[i] || "").trim(); });
        return obj;
      });

      resolve(results);
    } catch (err) {
      console.error("[Assets] CSV lesen fehlgeschlagen:", err.message);
      resolve([]);
    }
  });
}

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

function createKey(entry) {
  return `${entry.HostName}__${entry.BiosSerial || entry.ServiceTag || ""}`;
}

function docusnapToAsset(d, status = "Neu") {
  return {
    Key:                createKey(d),
    HostName:           d.HostName           || "",
    HostTypeID:         d.HostTypeID         || "",
    ActiveUser:         d.ActiveUser         || "",
    OS:                 d.OS                 || "",
    OSArchitecture:     d.OSArchitecture     || "",
    BiosSerial:         d.BiosSerial         || "",
    SystemManufacturer: d.SystemManufacturer || "",
    LastBootUpTime:     d.LastBootUpTime      || "",
    SystemProductName:  d.SystemProductName  || "",
    BuildNumber:        d.BuildNumber        || "",
    ONC:                d.ONC                || "",
    Status:             status,
    Kommentar:          "",
    LetzteAenderung:    new Date().toISOString(),
    isNew:              true,
  };
}

function saveAssets(data) {
  const header = COLUMNS.join(SEPARATOR) + "\n";
  const rows   = data.map(d =>
    COLUMNS.map(col => String(d[col] ?? "").replace(/;/g, ",")).join(SEPARATOR)
  ).join("\n");

  const dir = path.dirname(DASHBOARD_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DASHBOARD_FILE, header + rows, "utf8");
}

// ─── Initialer Import ────────────────────────────────────────────────────────

async function initIfNeeded() {
  if (!fs.existsSync(DASHBOARD_FILE)) {
    console.log("[Assets] assets.csv nicht gefunden – initialer Import...");
    const docusnap = await loadCSV(DOCUSNAP_FILE);
    const assets   = docusnap.map(d => docusnapToAsset(d));
    saveAssets(assets);
    console.log(`[Assets] ${assets.length} Einträge importiert.`);
  }
}

// ─── Business-Logik ──────────────────────────────────────────────────────────

async function getAssets() {
  const data = await loadCSV(DASHBOARD_FILE);
  const result = data.map(d => ({
    ...d,
    Modell: d.SystemProductName || "",
    isNew:  d.isNew === "true" || d.isNew === true,
  }));
  result.sort((a, b) => (b.isNew === true) - (a.isNew === true));
  return result;
}

async function getStats() {
  const data = await loadCSV(DASHBOARD_FILE);
  return {
    total:        data.length,
    neu:          data.filter(d => d.isNew === "true" || d.isNew === true).length,
    aktiv:        data.filter(d => d.Status === "Aktiv").length,
    verschrottet: data.filter(d => d.Status === "Verschrottet").length,
  };
}

async function updateAsset(hostName, biosSerial, status, kommentar) {
  const existing = await loadCSV(DASHBOARD_FILE);
  const key      = `${hostName}__${biosSerial}`;
  const index    = existing.findIndex(e => e.Key === key);

  if (index < 0) throw new Error(`Asset nicht gefunden: ${key}`);

  existing[index].Status          = status    ?? existing[index].Status;
  existing[index].Kommentar       = kommentar ?? existing[index].Kommentar;
  existing[index].LetzteAenderung = new Date().toISOString();
  existing[index].isNew           = false;

  saveAssets(existing);
  return existing[index];
}

async function importFromDocusnap() {
  const docusnap   = await loadCSV(DOCUSNAP_FILE);
  const existing   = await loadCSV(DASHBOARD_FILE);
  const existingMap = {};
  existing.forEach(d => { if (d.Key) existingMap[d.Key] = d; });

  let added = 0, updated = 0;

  docusnap.forEach(d => {
    const key = createKey(d);
    if (existingMap[key]) {
      const e = existingMap[key];
      e.HostTypeID         = d.HostTypeID         || e.HostTypeID;
      e.ActiveUser         = d.ActiveUser         || e.ActiveUser;
      e.OS                 = d.OS                 || e.OS;
      e.OSArchitecture     = d.OSArchitecture     || e.OSArchitecture;
      e.SystemManufacturer = d.SystemManufacturer || e.SystemManufacturer;
      e.LastBootUpTime     = d.LastBootUpTime      || e.LastBootUpTime;
      e.SystemProductName  = d.SystemProductName  || e.SystemProductName;
      e.BuildNumber        = d.BuildNumber        || e.BuildNumber;
      e.ONC                = d.ONC                || e.ONC;
      updated++;
    } else {
      existingMap[key] = docusnapToAsset(d);
      added++;
    }
  });

  saveAssets(Object.values(existingMap));
  return { added, updated };
}

module.exports = {
  initIfNeeded,
  getAssets,
  getStats,
  updateAsset,
  importFromDocusnap,
};