/**
 * topdesk.js – TopDesk-Routen
 *
 * FIX #2: Webhook-Secret ist jetzt PFLICHT – kein optionaler Guard mehr
 * FIX #2: crypto.timingSafeEqual gegen Timing-Angriffe
 * FIX #8: Deduplication-Cache verhindert doppelte Verarbeitung bei Webhook-Retries
 */

const express  = require("express");
const crypto   = require("crypto");
const { requireAuth }   = require("../middleware/authMiddleware");
const { requirePermission } = require("../middleware/rbac");
const topdesk  = require("../services/topdeskClient");
const {
  processEintritt,
  processAustritt,
  processAbteilungswechsel,
  processPendingChanges,
} = require("../actions/topdesk/processTopdeskChanges");

const router = express.Router();

// ─── Startup-Prüfung: Secret muss gesetzt sein ──────────────────────────────
// FIX #2: Fehlt das Secret, startet der Webhook-Endpunkt gar nicht erst.
const WEBHOOK_SECRET = process.env.TOPDESK_WEBHOOK_SECRET;
if (!WEBHOOK_SECRET) {
  console.error(
    "[FATAL] TOPDESK_WEBHOOK_SECRET ist nicht gesetzt. " +
    "Der Webhook-Endpunkt ist damit ungesichert. Server wird nicht gestartet."
  );
  // In Produktion: Process beenden
  if (process.env.NODE_ENV === "production") process.exit(1);
}

// ─── FIX #8: Deduplication-Cache ────────────────────────────────────────────
// Verhindert Race Condition wenn TopDesk den gleichen Webhook zweimal sendet.
// TTL: 5 Minuten (nach der Zeit ist eine doppelte Verarbeitung wieder erlaubt,
// falls ein echter Retry nötig ist).
const DEDUP_TTL_MS    = 5 * 60 * 1000;
const inProgressCache = new Map(); // changeId → timestamp

function isAlreadyProcessing(changeId) {
  const ts = inProgressCache.get(changeId);
  if (!ts) return false;
  if (Date.now() - ts > DEDUP_TTL_MS) {
    inProgressCache.delete(changeId);
    return false;
  }
  return true;
}

function markProcessing(changeId)  { inProgressCache.set(changeId, Date.now()); }
function clearProcessing(changeId) { inProgressCache.delete(changeId); }

// ─── Service-Account-Credential aus ENV ─────────────────────────────────────
function getServiceCredential() {
  const u = process.env.AD_SERVICE_ACCOUNT;
  const p = process.env.AD_SERVICE_PASSWORD;
  if (!u || !p) throw new Error("AD_SERVICE_ACCOUNT / AD_SERVICE_PASSWORD nicht konfiguriert.");
  return { username: u, password: p };
}

// ─── Dispatch-Helfer ─────────────────────────────────────────────────────────
async function dispatchChange(change, credential) {
  const cat = change.category?.name || "";
  if (cat === topdesk.CHANGE_CATEGORIES.EINTRITT)
    return processEintritt(change, credential);
  if (cat === topdesk.CHANGE_CATEGORIES.AUSTRITT)
    return processAustritt(change, credential);
  if (cat === topdesk.CHANGE_CATEGORIES.ABT_WECHSEL)
    return processAbteilungswechsel(change, credential);
  throw new Error(`Unbekannte Kategorie: ${cat}`);
}

// ─── Offene Changes anzeigen ─────────────────────────────────────────────────
router.get("/pending", requireAuth, requirePermission("topdesk:read"), async (req, res) => {
  try {
    const [eintritte, austritte, wechsel] = await Promise.all([
      topdesk.getChanges("EINTRITT").catch(() => []),
      topdesk.getChanges("AUSTRITT").catch(() => []),
      topdesk.getChanges("ABT_WECHSEL").catch(() => []),
    ]);

    res.json({
      eintritte:         eintritte.map(topdesk.normalizeEintritt),
      austritte:         austritte.map(topdesk.normalizeAustritt),
      abteilungswechsel: wechsel.map(topdesk.normalizeAbteilungswechsel),
      total: eintritte.length + austritte.length + wechsel.length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Alle Changes verarbeiten (manuell) ──────────────────────────────────────
router.post("/process", requireAuth, requirePermission("topdesk:process-batch"), async (req, res) => {
  req.audit.log({
    action: "TOPDESK_BATCH_PROCESS", target: "all",
    targetType: "topdesk", result: "success",
    details: { trigger: "manual", actor: req.audit.actor },
  });
  try {
    const credential = getServiceCredential();
    const summary    = await processPendingChanges(credential);
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Einzelnen Change verarbeiten (manuell) ──────────────────────────────────
router.post("/process/:changeId", requireAuth, requirePermission("topdesk:process-single"), async (req, res) => {
  const { changeId } = req.params;
  if (!/^[a-zA-Z0-9_-]+$/.test(changeId)) {
    return res.status(400).json({ error: "Ungültige Change-ID" });
  }
  try {
    const credential = getServiceCredential();
    const change     = await topdesk.getChangeById(changeId);
    const result     = await dispatchChange(change, credential);

    req.audit.log({
      action: "TOPDESK_SINGLE_PROCESS", target: changeId,
      targetType: "topdesk", result: "success",
      details: { category: change.category?.name },
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Webhook ─────────────────────────────────────────────────────────────────
// FIX #2: Pflicht-Secret, timingSafeEqual, kein optionaler Guard
router.post("/webhook", (req, res) => {
  // 1. Secret validieren
  const incoming = req.headers["x-topdesk-secret"] || "";

  if (!WEBHOOK_SECRET) {
    // Wurde oben abgefangen, aber sicherheitshalber nochmal
    return res.status(503).json({ error: "Webhook nicht konfiguriert." });
  }

  // FIX #2: Constant-time comparison – verhindert Timing-Angriffe
  let valid = false;
  try {
    valid = crypto.timingSafeEqual(
      Buffer.from(incoming.padEnd(WEBHOOK_SECRET.length, "\0")),
      Buffer.from(WEBHOOK_SECRET)
    );
  } catch {
    valid = false;
  }

  if (!valid) {
    return res.status(401).end();  // Kein Body – kein Info-Leak
  }

  const changeId = req.body?.changeId || req.body?.number;
  if (!changeId || !/^[a-zA-Z0-9_-]+$/.test(String(changeId))) {
    return res.status(400).json({ error: "changeId fehlt oder ungültig" });
  }

  // FIX #8: Doppelte Verarbeitung verhindern
  if (isAlreadyProcessing(changeId)) {
    return res.json({ ok: true, queued: false, reason: "already_processing" });
  }

  // Sofort 200 antworten – TopDesk erwartet schnelle Antwort
  res.json({ ok: true, queued: true });

  // Async im Hintergrund verarbeiten
  markProcessing(changeId);
  setImmediate(async () => {
    try {
      const credential = getServiceCredential();
      const change     = await topdesk.getChangeById(changeId);
      await dispatchChange(change, credential);
    } catch (err) {
      console.error("[TopDesk Webhook] Verarbeitungsfehler:", err.message);
    } finally {
      clearProcessing(changeId);
    }
  });
});

module.exports = router;