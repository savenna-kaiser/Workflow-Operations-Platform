/**
 * scheduler.js – Automatische TopDesk-Verarbeitung per Cron
 * Liegt in jobs/ – Pfade entsprechend angepasst.
 */

const { processPendingChanges } = require("../actions/topdesk/processTopdeskChanges");
const { logSuccess, logFailure } = require("../services/auditLog");

const INTERVAL_MIN = parseInt(process.env.TOPDESK_CRON_INTERVAL_MIN || "15", 10);
const INTERVAL_MS  = INTERVAL_MIN * 60 * 1000;

function getServiceCredential() {
  const u = process.env.AD_SERVICE_ACCOUNT;
  const p = process.env.AD_SERVICE_PASSWORD;
  if (!u || !p) return null;
  return { username: u, password: p };
}

async function runCycle() {
  const credential = getServiceCredential();
  if (!credential) {
    console.warn("[Scheduler] AD_SERVICE_ACCOUNT nicht konfiguriert – Cron übersprungen.");
    return;
  }

  console.log(`[Scheduler] TopDesk-Sync gestartet (${new Date().toISOString()})`);

  try {
    const summary = await processPendingChanges(credential);
    logSuccess("TOPDESK_CRON_RUN", "scheduler", "topdesk", "topdesk", {
      processed: summary.processed,
      errors:    summary.errors,
    });
    console.log(`[Scheduler] Fertig: ${summary.processed} verarbeitet, ${summary.errors} Fehler`);
  } catch (err) {
    logFailure("TOPDESK_CRON_RUN", "scheduler", "topdesk", "topdesk", err.message);
    console.error("[Scheduler] Fehler:", err.message);
  }
}

if (process.env.TOPDESK_CRON_ENABLED === "true") {
  setTimeout(() => {
    runCycle();
    setInterval(runCycle, INTERVAL_MS);
    console.log(`[Scheduler] TopDesk-Cron aktiv: alle ${INTERVAL_MIN} Minuten`);
  }, 5000);
}

module.exports = { runCycle };