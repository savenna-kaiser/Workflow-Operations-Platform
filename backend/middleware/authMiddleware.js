/**
 * authMiddleware.js
 *
 * Schützt Routen: nur eingeloggte Admins dürfen weiter.
 * Nicht-authentifizierte Requests werden mit 401 abgewiesen.
 */

const { logFailure, ACTION_TYPES } = require("../services/auditLog");

function requireAuth(req, res, next) {
  if (req.session?.user) {
    return next();
  }

  // /auth/me wird nicht geloggt – normaler Session-Check beim Seitenaufruf
  const isAuthMe = req.path === "/me" && req.baseUrl?.includes("/auth");
  if (!isAuthMe) {
    logFailure(
      ACTION_TYPES.LOGIN,
      "unauthenticated",
      req.path,
      "route",
      "Unauthenticated access attempt",
      {},
      req.requestId || "",
      req.ip || ""
    );
  }

  res.status(401).json({ error: "Nicht angemeldet. Bitte zuerst einloggen." });
}

module.exports = { requireAuth };
