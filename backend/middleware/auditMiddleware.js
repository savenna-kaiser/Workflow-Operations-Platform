/**
 * auditMiddleware.js
 * Pfade angepasst: credentialCrypto liegt in services/
 */

const { v4: uuidv4 }        = require("uuid");
const { writeAuditLog }     = require("../services/auditLog");
const { decryptCredential } = require("../services/credentialCrypto");

const IDLE_TIMEOUT_MS = parseInt(process.env.SESSION_IDLE_TIMEOUT_MIN || "30", 10) * 60 * 1000;

function auditMiddleware(req, res, next) {
  // Idle-Timeout
  if (req.session?.user) {
    const lastActivity = req.session.user.lastActivity || 0;
    if (Date.now() - lastActivity > IDLE_TIMEOUT_MS) {
      const actor = req.session.user.samAccountName;
      req.session.destroy(() => {});
      writeAuditLog({
        action: "AUTH_SESSION_EXPIRED", actor, target: actor,
        targetType: "session", result: "success",
        details: { reason: "idle_timeout" },
      });
      return res.status(401).json({ error: "Sitzung abgelaufen. Bitte neu einloggen." });
    }
    req.session.user.lastActivity = Date.now();
  }

  // /auth/me nicht loggen – reine Session-Prüfung beim Seitenaufruf
  const isAuthMe = req.path === "/me" && req.baseUrl?.includes("/auth");

  const requestId = uuidv4();
  req.requestId   = requestId;

  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0].trim() ||
    req.socket?.remoteAddress || "";

  const actor = req.session?.user?.samAccountName || "unauthenticated";

  req.audit = {
    requestId,
    actor,
    ip,

    getCredential() {
      const encrypted = req.session?.encryptedCredential;
      if (!encrypted) return null;
      const cred = decryptCredential(encrypted);
      if (!cred) throw new Error("Session-Credential ungültig oder manipuliert.");
      return cred;
    },

    log(entry) {
      if (isAuthMe) return;
      writeAuditLog({
        ...entry,
        actor:     entry.actor     || actor,
        requestId: entry.requestId || requestId,
        ip:        entry.ip        || ip,
      });
    },
  };

  next();
}

module.exports = auditMiddleware;