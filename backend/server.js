/**
 * server.js – AD-Manager Express Server
 * Pfade angepasst an tatsächliche Projektstruktur:
 *   scheduler liegt in jobs/scheduler.js
 *   public liegt neben server.js (./public)
 */

require("dotenv").config();

// ─── Startup-Validierung ─────────────────────────────────────────────────────
const REQUIRED_ENV = [
  "SESSION_SECRET",
  "AD_DC",
  "AD_SERVICE_ACCOUNT",
  "AD_SERVICE_PASSWORD",
  "TOPDESK_WEBHOOK_SECRET",
  "AD_NEW_USER_INITIAL_PASSWORD",
];

const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length > 0) {
  console.error(`[FATAL] Pflicht-Umgebungsvariablen fehlen: ${missing.join(", ")}`);
  console.error("Bitte .env prüfen. Server wird nicht gestartet.");
  process.exit(1);
}

const express        = require("express");
const session        = require("express-session");
const path           = require("path");

const auditMiddleware   = require("./middleware/auditMiddleware");
const authRoutes        = require("./routes/auth");
const usersRoutes       = require("./routes/users");
const auditRoutes       = require("./routes/auditRoute");
const topdeskRoutes     = require("./routes/topdesk");
const citrixRoutes      = require("./routes/citrix");
const computerRoutes    = require("./routes/computers");
const { getPoolStatus } = require("./services/powershellBridge");
const docusnapRoutes    = require("./routes/docusnap").router;

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "64kb" }));
app.use(express.urlencoded({ extended: true, limit: "64kb" }));

app.use(session({
  secret:            process.env.SESSION_SECRET,
  resave:            false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure:   process.env.NODE_ENV !== "development",
    sameSite: "strict",
    maxAge:   8 * 60 * 60 * 1000,
  },
}));

app.use(auditMiddleware);

// Health-Check
app.get("/health", (req, res) => {
  let psStatus = [];
  try { psStatus = getPoolStatus(); } catch {}
  const healthy = psStatus.filter(s => s.ready).length > 0;
  res.status(healthy ? 200 : 503).json({
    status:  healthy ? "ok" : "degraded",
    workers: psStatus,
    uptime:  Math.floor(process.uptime()),
    ts:      new Date().toISOString(),
  });
});

app.use(express.static(path.join(__dirname, "public")));

app.use("/api/auth",      authRoutes);
app.use("/api/users",    usersRoutes);
app.use("/api/audit",    auditRoutes);
app.use("/api/topdesk",  topdeskRoutes);
app.use("/api/citrix",   citrixRoutes);
app.use("/api/computers",computerRoutes);
app.use("/api/docusnap", docusnapRoutes);

// Cron – liegt in jobs/
require("./jobs/scheduler");

app.get("*", (req, res) => {
  const index = path.join(__dirname, "public", "index.html");
  res.sendFile(index, (err) => {
    if (err) res.status(404).json({ error: "Not found" });
  });
});

app.use((err, req, res, _next) => {
  console.error("[Error]", err.message);
  res.status(500).json({ error: "Interner Serverfehler" });
});

const server = app.listen(PORT, () => {
  console.log(`AD-Manager läuft auf http://localhost:${PORT}`);
});

function shutdown(signal) {
  console.log(`[Server] ${signal} – Graceful Shutdown...`);
  server.close(() => { console.log("[Server] geschlossen."); process.exit(0); });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));

module.exports = app;