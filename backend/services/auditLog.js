/**
 * auditLog.js – Enterprise Audit-Log
 *
 * Zwei Schreibsenken parallel:
 *   1. Winston  → logs/audit-YYYY-MM-DD.log (30 Tage Rotation, gzip)
 *   2. SQLite   → data/audit.db (durchsuchbar, paginierbar, indiziert)
 *
 * Lesen erfolgt ausschließlich aus SQLite.
 */

const winston = require("winston");
require("winston-daily-rotate-file");
const path = require("path");
const fs   = require("fs");

// ─── Pfade ────────────────────────────────────────────────────────────────────

const logDir = path.join(__dirname, "../logs");
const dbDir  = path.join(__dirname, "../data");

if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
if (!fs.existsSync(dbDir))  fs.mkdirSync(dbDir,  { recursive: true });

// ─── ACTION_TYPES ─────────────────────────────────────────────────────────────

const ACTION_TYPES = {
  LOGIN:           "AUTH_LOGIN",
  LOGOUT:          "AUTH_LOGOUT",
  LOGIN_FAILED:    "AUTH_LOGIN_FAILED",
  USER_SEARCH:     "USER_SEARCH",
  USER_ENABLE:     "USER_ENABLE",
  USER_DISABLE:    "USER_DISABLE",
  USER_UNLOCK:     "USER_UNLOCK",
  USER_RESET_PWD:  "USER_RESET_PASSWORD",
  USER_EDIT:       "USER_EDIT",
  USER_MOVE:       "USER_MOVE",
  GROUP_ADD:       "GROUP_ADD_MEMBER",
  GROUP_REMOVE:    "GROUP_REMOVE_MEMBER",
  COMPUTER_SEARCH: "COMPUTER_SEARCH",
  COMPUTER_ENABLE: "COMPUTER_ENABLE",
  COMPUTER_DISABLE:"COMPUTER_DISABLE",
  COMPUTER_MOVE:   "COMPUTER_MOVE",
  CITRIX_LOGOFF:   "CITRIX_LOGOFF",
  TEAMVIEWER_OPEN: "TEAMVIEWER_OPEN",
  OOO_SET:         "OUT_OF_OFFICE_SET",
  ACCESS_DENIED:   "ACCESS_DENIED",
};

// ─── SQLite ───────────────────────────────────────────────────────────────────

let db = null;
let insertStmt = null;

function getDb() {
  if (db) return db;
  try {
    const Database = require("better-sqlite3");
    db = new Database(path.join(dbDir, "audit.db"));

    // WAL-Mode für bessere Concurrent-Write-Performance
    db.pragma("journal_mode = WAL");
    db.pragma("synchronous = NORMAL");

    db.exec(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        ts          TEXT    NOT NULL,
        actor       TEXT    NOT NULL DEFAULT 'unknown',
        role        TEXT,
        action      TEXT    NOT NULL,
        target      TEXT,
        target_type TEXT,
        result      TEXT    NOT NULL DEFAULT 'success',
        error       TEXT,
        ip          TEXT,
        request_id  TEXT,
        details     TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_ts         ON audit_log(ts);
      CREATE INDEX IF NOT EXISTS idx_actor      ON audit_log(actor);
      CREATE INDEX IF NOT EXISTS idx_action     ON audit_log(action);
      CREATE INDEX IF NOT EXISTS idx_target     ON audit_log(target);
      CREATE INDEX IF NOT EXISTS idx_result     ON audit_log(result);
    `);

    insertStmt = db.prepare(`
      INSERT INTO audit_log
        (ts, actor, role, action, target, target_type, result, error, ip, request_id, details)
      VALUES
        (@ts, @actor, @role, @action, @target, @target_type, @result, @error, @ip, @request_id, @details)
    `);

    console.log("[Audit] SQLite-Datenbank bereit:", path.join(dbDir, "audit.db"));
  } catch (err) {
    console.error("[Audit] SQLite nicht verfügbar – nur Winston-Logging aktiv:", err.message);
    console.error("[Audit] Bitte 'npm install better-sqlite3' im Backend ausführen.");
  }
  return db;
}

// ─── Winston ──────────────────────────────────────────────────────────────────

const fileTransport = new winston.transports.DailyRotateFile({
  dirname:       logDir,
  filename:      "audit-%DATE%.log",
  datePattern:   "YYYY-MM-DD",
  maxFiles:      "30d",
  zippedArchive: true,
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DDTHH:mm:ss.SSSZ" }),
    winston.format.json()
  ),
});

const consoleTransport = new winston.transports.Console({
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.colorize({ level: true }),
    winston.format.printf((info) => {
      const actor  = info.actor  || "-";
      const action = info.action || info.message || "-";
      const target = info.target || "-";
      const result = info.result || "-";
      return `${info.timestamp} [${info.level}] ${actor} | ${action} | ${target} | ${result}`;
    })
  ),
});

const logger = winston.createLogger({
  level: "info",
  transports: [
    fileTransport,
    ...(process.env.NODE_ENV !== "production" ? [consoleTransport] : []),
  ],
});

// ─── Schreiben ────────────────────────────────────────────────────────────────

function writeAuditLog(entry) {
  const {
    action,
    actor      = "unknown",
    role       = "",
    target     = "",
    targetType = "",
    result     = "success",
    details    = {},
    requestId  = "",
    ip         = "",
    error      = "",
  } = entry;

  if (!action) throw new Error("auditLog.writeAuditLog: 'action' ist Pflichtfeld");

  const ts    = new Date().toISOString();
  const level = result === "failure" ? "warn" : "info";

  // 1) Winston (Datei + Konsole)
  logger.log(level, action, {
    action, actor, role, target, targetType,
    result, requestId, ip, details,
    ...(error ? { error } : {}),
  });

  // 2) SQLite
  const database = getDb();
  if (database && insertStmt) {
    try {
      insertStmt.run({
        ts,
        actor,
        role,
        action,
        target,
        target_type: targetType,
        result,
        error:       error || null,
        ip:          ip    || null,
        request_id:  requestId || null,
        details:     Object.keys(details).length > 0 ? JSON.stringify(details) : null,
      });
    } catch (dbErr) {
      console.error("[Audit] SQLite-Schreibfehler:", dbErr.message);
    }
  }
}

// ─── Convenience-Wrapper ──────────────────────────────────────────────────────

function logSuccess(action, actor, target, targetType, details = {}, requestId = "", ip = "") {
  writeAuditLog({ action, actor, target, targetType, result: "success", details, requestId, ip });
}

function logFailure(action, actor, target, targetType, error = "", details = {}, requestId = "", ip = "") {
  writeAuditLog({ action, actor, target, targetType, result: "failure", error, details, requestId, ip });
}

// ─── Lesen aus SQLite ─────────────────────────────────────────────────────────

/**
 * Liest Audit-Einträge aus SQLite mit Pagination und Filtern.
 *
 * @param {object} opts
 * @param {number}  opts.page       – Seite (1-basiert)
 * @param {number}  opts.pageSize   – Einträge pro Seite
 * @param {string}  opts.actor      – exakter SAM-Account (optional)
 * @param {string}  opts.action     – exakte ACTION_TYPE (optional)
 * @param {string}  opts.target     – Partial-Match (optional)
 * @param {string}  opts.result     – "success" | "failure" (optional)
 * @param {string}  opts.dateFrom   – ISO-Datum von (optional)
 * @param {string}  opts.dateTo     – ISO-Datum bis (optional)
 * @param {string}  opts.q          – Freitext über actor, target, action, error (optional)
 * @param {boolean} opts.onlyOwn    – nur eigene Einträge (helpdesk-Einschränkung)
 * @returns {{ entries: object[], total: number, page: number, pageSize: number, pages: number }}
 */
function queryAuditLog({
  page     = 1,
  pageSize = 50,
  actor,
  action,
  target,
  result,
  dateFrom,
  dateTo,
  q,
  onlyOwn  = false,
} = {}) {
  const database = getDb();

  // Fallback: wenn SQLite nicht verfügbar → leere Antwort
  if (!database) {
    return { entries: [], total: 0, page, pageSize, pages: 0 };
  }

  const conditions = [];
  const params     = {};

  if (actor || onlyOwn) {
    conditions.push("actor = @actor");
    params.actor = actor || "";
  }
  if (action) {
    conditions.push("action = @action");
    params.action = action;
  }
  if (target) {
    conditions.push("target LIKE @target");
    params.target = `%${target}%`;
  }
  if (result) {
    conditions.push("result = @result");
    params.result = result;
  }
  if (dateFrom) {
    conditions.push("ts >= @dateFrom");
    params.dateFrom = dateFrom;
  }
  if (dateTo) {
    // dateTo bis Ende des Tages
    params.dateTo = dateTo.length === 10 ? `${dateTo}T23:59:59.999Z` : dateTo;
    conditions.push("ts <= @dateTo");
  }
  if (q) {
    conditions.push("(actor LIKE @q OR target LIKE @q OR action LIKE @q OR error LIKE @q)");
    params.q = `%${q}%`;
  }

  const where  = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const offset = (Math.max(1, page) - 1) * pageSize;

  const total   = database.prepare(`SELECT COUNT(*) as n FROM audit_log ${where}`).get(params).n;
  const entries = database.prepare(
    `SELECT * FROM audit_log ${where} ORDER BY ts DESC LIMIT ${pageSize} OFFSET ${offset}`
  ).all(params).map(row => ({
    ...row,
    details: row.details ? JSON.parse(row.details) : {},
  }));

  return {
    entries,
    total,
    page:     Math.max(1, page),
    pageSize,
    pages:    Math.ceil(total / pageSize),
  };
}

// Alle eindeutigen ACTION_TYPES in der DB – für Filter-Dropdown
function getDistinctActions() {
  const database = getDb();
  if (!database) return Object.values(ACTION_TYPES);
  return database.prepare("SELECT DISTINCT action FROM audit_log ORDER BY action").all().map(r => r.action);
}

// Alle eindeutigen Akteure – für Filter-Dropdown (nur it-admin/it-lead)
function getDistinctActors() {
  const database = getDb();
  if (!database) return [];
  return database.prepare("SELECT DISTINCT actor FROM audit_log ORDER BY actor").all().map(r => r.actor);
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  ACTION_TYPES,
  writeAuditLog,
  logSuccess,
  logFailure,
  // Legacy-Kompatibilität (alte Route nutzt getRecentEntries)
  getRecentEntries: (opts = {}) => queryAuditLog({
    page: 1, pageSize: opts.limit || 200,
    actor: opts.actor, action: opts.action,
    target: opts.target, result: opts.result,
  }).entries,
  queryAuditLog,
  getDistinctActions,
  getDistinctActors,
};
