/**
 * auth.js – Login / Logout Routen
 * Pfade angepasst an tatsächliche Projektstruktur:
 *   adLogin liegt in actions/auth/adLogin.js → ../actions/auth/adLogin
 *   credentialCrypto in services/            → ../services/credentialCrypto
 */

const express               = require("express");
const { ACTION_TYPES }      = require("../services/auditLog");
const { requireAuth }       = require("../middleware/authMiddleware");
const { validate, schemas } = require("../middleware/validation");
const { encryptCredential } = require("../services/credentialCrypto");
const { getRoleForUser }    = require("../middleware/rbac");
const adLogin               = require("../actions/auth/adLogin");

const router = express.Router();

router.post("/login", validate(schemas.login), async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await adLogin.execute({ username, password });

    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ error: "Session-Fehler beim Login." });

      req.session.user = {
        samAccountName: user.samAccountName,
        displayName:    user.displayName,
        loginAt:        new Date().toISOString(),
        lastActivity:   Date.now(),
        role:           getRoleForUser(user.samAccountName, user.memberOf || []),
      };

      req.session.encryptedCredential = encryptCredential(user.credential);

      req.audit.log({
        action:     ACTION_TYPES.LOGIN,
        actor:      user.samAccountName,
        target:     user.samAccountName,
        targetType: "user",
        result:     "success",
      });

      return res.json({ ok: true, user: req.session.user });
    });

  } catch (err) {
    req.audit.log({
      action:     ACTION_TYPES.LOGIN_FAILED,
      actor:      username,
      target:     username,
      targetType: "user",
      result:     "failure",
      error:      err.message,
    });
    return res.status(401).json({ error: "Anmeldung fehlgeschlagen." });
  }
});

router.post("/logout", requireAuth, (req, res) => {
  const actor = req.session.user.samAccountName;
  req.audit.log({ action: ACTION_TYPES.LOGOUT, actor, target: actor, targetType: "user", result: "success" });
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.json({ ok: true });
  });
});

router.get("/me", requireAuth, (req, res) => {
  const { samAccountName, displayName, loginAt, role } = req.session.user;
  res.json({ user: { samAccountName, displayName, loginAt, role } });
});

module.exports = router;