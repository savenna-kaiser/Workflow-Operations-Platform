/**
 * citrix.js – Citrix Session Routen
 *
 * GET /api/citrix/session/:sam     – Session eines Users
 * GET /api/citrix/client/:name     – User auf einem Client-PC
 * GET /api/citrix/active           – Alle aktiven Sessions
 * GET /api/citrix/diagnostics      – CSV-Diagnose (nur it-lead)
 */

const express  = require("express");
const { requireAuth }       = require("../middleware/authMiddleware");
const { requirePermission } = require("../middleware/rbac");
const {
  getSessionForUser,
  getSessionForClient,
  getActiveSessions,
  getDiagnostics,
} = require("../services/citrixService");

const router = express.Router();
router.use(requireAuth);

// Session eines Users
router.get("/session/:sam", requirePermission("user:search"), (req, res) => {
  const session = getSessionForUser(req.params.sam);
  res.json({ session });
});

// User auf einem Client-PC
router.get("/client/:name", requirePermission("user:search"), (req, res) => {
  const session = getSessionForClient(req.params.name);
  res.json({ session });
});

// Alle aktiven Sessions
router.get("/active", requirePermission("user:search"), (req, res) => {
  const sessions = getActiveSessions();
  res.json({ sessions, count: sessions.length });
});

// Diagnose – nur für it-lead (kein sensibles Logging, aber interne Daten)
router.get("/diagnostics", requirePermission("user:search"), (req, res) => {
  const diag = getDiagnostics();
  res.json(diag);
});

module.exports = router;