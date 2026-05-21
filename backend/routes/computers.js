/**
 * computers.js – Computer-Routen
 *
 * GET  /api/computers/search?q=…
 * POST /api/computers/:name/enable
 * POST /api/computers/:name/disable
 */

const express               = require("express");
const { requireAuth }       = require("../middleware/authMiddleware");
const { requirePermission } = require("../middleware/rbac");
const { ACTION_TYPES }      = require("../services/auditLog");
const { withAudit }         = require("../services/withAudit");
const adClient              = require("../services/adClient");

const router = express.Router();
router.use(requireAuth);

// Computername-Validierung
function validateName(req, res, next) {
  if (!/^[a-zA-Z0-9._-]+$/.test(req.params.name)) {
    return res.status(400).json({ error: "Ungültiger Computername" });
  }
  next();
}

// ─── Suche ───────────────────────────────────────────────────────────────────
router.get("/search", requirePermission("computer:search"), async (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 2) return res.status(400).json({ error: "Suchbegriff fehlt (min. 2 Zeichen)" });

  try {
    const credential = req.audit.getCredential();
    const results    = await adClient.searchComputers(q, credential);
    req.audit.log({
      action: ACTION_TYPES.COMPUTER_SEARCH, target: q,
      targetType: "computer", result: "success",
      details: { count: results.length },
    });
    res.json({ results });
  } catch (err) {
    req.audit.log({ action: ACTION_TYPES.COMPUTER_SEARCH, target: q,
                    targetType: "computer", result: "failure", error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ─── Aktivieren ──────────────────────────────────────────────────────────────
router.post("/:name/enable", validateName, requirePermission("computer:enable"), async (req, res) => {
  try {
    const credential = req.audit.getCredential();
    await withAudit(
      () => adClient.enableComputer(req.params.name, null, credential),
      { action: ACTION_TYPES.COMPUTER_ENABLE, target: req.params.name, targetType: "computer" },
      req.audit
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Deaktivieren ─────────────────────────────────────────────────────────────
router.post("/:name/disable", validateName, requirePermission("computer:disable"), async (req, res) => {
  try {
    const credential = req.audit.getCredential();
    await withAudit(
      () => adClient.disableComputer(req.params.name, credential),
      { action: ACTION_TYPES.COMPUTER_DISABLE, target: req.params.name, targetType: "computer" },
      req.audit
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;