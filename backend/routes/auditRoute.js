/**
 * auditRoute.js – Audit-Log API
 *
 * GET  /api/audit          – Einträge mit Filtern + Pagination
 * GET  /api/audit/meta     – Distinct Actions + Actors für Dropdowns
 * GET  /api/audit/export   – CSV-Export (nur it-lead)
 *
 * Berechtigungen:
 *   it-lead  → alle Einträge, Export
 *   it-admin → alle Einträge, kein Export
 *   helpdesk → kein Zugriff (audit:read fehlt in rbac.js)
 */

const express               = require("express");
const { requireAuth }       = require("../middleware/authMiddleware");
const { requirePermission } = require("../middleware/rbac");
const {
  queryAuditLog,
  getDistinctActions,
  getDistinctActors,
} = require("../services/auditLog");

const router = express.Router();
router.use(requireAuth);

// ─── GET /api/audit ───────────────────────────────────────────────────────────

router.get("/", requirePermission("audit:read"), (req, res) => {
  const {
    page, pageSize,
    actor, action, target, result,
    dateFrom, dateTo, q,
  } = req.query;

  const role    = req.session?.user?.role;
  const sam     = req.session?.user?.samAccountName;

  // it-admin sieht alle; helpdesk hat keinen Zugriff (durch requirePermission geblockt)
  // Zur Sicherheit: falls jemand audit:read ohne Admin-Rolle hätte → nur eigene
  const onlyOwn = role !== "it-admin" && role !== "it-lead";

  try {
    const result_ = queryAuditLog({
      page:     parseInt(page,     10) || 1,
      pageSize: parseInt(pageSize, 10) || 50,
      actor:    onlyOwn ? sam : actor,
      action,
      target,
      result,
      dateFrom,
      dateTo,
      q,
      onlyOwn,
    });

    res.json(result_);
  } catch (err) {
    console.error("[Audit] Query-Fehler:", err.message);
    res.status(500).json({ error: "Fehler beim Lesen des Audit-Logs" });
  }
});

// ─── GET /api/audit/meta ──────────────────────────────────────────────────────

router.get("/meta", requirePermission("audit:read"), (req, res) => {
  try {
    const role = req.session?.user?.role;
    // Actors nur für Admins (helpdesk sieht sowieso nur sich selbst)
    const actors  = (role === "it-admin" || role === "it-lead") ? getDistinctActors() : [];
    const actions = getDistinctActions();
    res.json({ actors, actions });
  } catch (err) {
    res.status(500).json({ error: "Fehler beim Laden der Metadaten" });
  }
});

// ─── GET /api/audit/export ────────────────────────────────────────────────────

router.get("/export", requirePermission("audit:export"), (req, res) => {
  const { actor, action, target, result, dateFrom, dateTo, q } = req.query;

  try {
    const { entries } = queryAuditLog({
      page: 1, pageSize: 10000, // Export: max 10.000 Einträge
      actor, action, target, result, dateFrom, dateTo, q,
    });

    const header = "Zeitstempel;Benutzer;Rolle;Aktion;Ziel;Zieltyp;Ergebnis;Fehler;IP\n";
    const rows   = entries.map(e => [
      e.ts, e.actor, e.role || "", e.action,
      e.target || "", e.target_type || "",
      e.result, e.error || "", e.ip || "",
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\n");

    const filename = `audit-export-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    // UTF-8 BOM für Excel
    res.send("\uFEFF" + header + rows);
  } catch (err) {
    console.error("[Audit] Export-Fehler:", err.message);
    res.status(500).json({ error: "Fehler beim Export" });
  }
});

module.exports = router;
