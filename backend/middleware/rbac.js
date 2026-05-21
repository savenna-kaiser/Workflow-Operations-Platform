/**
 * rbac.js – Role-Based Access Control
 *
 * FIX #7: Minimale aber vollständige RBAC-Implementierung.
 *
 * Rollen (in AD-Gruppe oder .env konfigurierbar):
 *   helpdesk   – unlock, reset-password, search, read-only
 *   it-admin   – alles ausser TopDesk-Batch
 *   it-lead    – alles inkl. TopDesk-Batch-Processing
 *
 * Zuweisung: Beim Login wird die Rolle aus der AD-Gruppenmitgliedschaft
 * ermittelt und in der Session gespeichert.
 * Für den Anfang: manuelle Zuweisung via RBAC_ADMINS / RBAC_HELPDESK in .env
 */

// ─── Rollen-Definitionen ─────────────────────────────────────────────────────

const ROLES = {
  HELPDESK:  "helpdesk",
  IT_ADMIN:  "it-admin",
  IT_LEAD:   "it-lead",
};

// Berechtigungen pro Rolle (additiv – höhere Rollen erben niedrigere)
const PERMISSIONS = {
  [ROLES.HELPDESK]: [
    "user:search",
    "user:unlock",
    "user:reset-password",
    "user:read-groups",
  ],
  [ROLES.IT_ADMIN]: [
    "user:search",
    "user:unlock",
    "user:reset-password",
    "user:read-groups",
    "user:enable",
    "user:disable",
    "user:edit",
    "user:add-group",
    "user:remove-group",
    "computer:search",
    "computer:enable",
    "computer:disable",
    "topdesk:read",
    "topdesk:process-single",
    "audit:read",
  ],
  [ROLES.IT_LEAD]: [
    "user:search",
    "user:unlock",
    "user:reset-password",
    "user:read-groups",
    "user:enable",
    "user:disable",
    "user:edit",
    "user:add-group",
    "user:remove-group",
    "computer:search",
    "computer:enable",
    "computer:disable",
    "topdesk:read",
    "topdesk:process-single",
    "topdesk:process-batch",
    "audit:read",
    "audit:export",
  ],
};

// ─── Rollenzuweisung ─────────────────────────────────────────────────────────

// AD-Gruppen die eine Rolle verleihen – in .env konfigurieren
// Beispiel: RBAC_GROUP_IT_LEADS=GRP_ADManager_Lead
// Fallback: leerer String = Funktion deaktiviert, ENV-Liste wird verwendet
const GROUP_LEAD    = process.env.RBAC_GROUP_IT_LEADS  || "";
const GROUP_ADMIN   = process.env.RBAC_GROUP_IT_ADMINS || "";
const GROUP_HELPDESK= process.env.RBAC_GROUP_HELPDESK  || "";

/**
 * Ermittelt die Rolle anhand der AD-Gruppenmitgliedschaft des Users.
 * Wird beim Login aufgerufen – das Ergebnis landet in der Session.
 *
 * Wenn keine AD-Gruppen konfiguriert sind (RBAC_GROUP_* leer),
 * fällt die Funktion auf die .env-Listen zurück (RBAC_IT_LEADS etc.).
 *
 * @param {string}   samAccountName
 * @param {string[]} [memberOf]  – DN-Liste der Gruppen aus dem Login-Response
 * @returns {string} Rolle
 */
function getRoleForUser(samAccountName, memberOf = []) {
  // ── AD-Gruppen-Modus ──────────────────────────────────────────────────────
  // memberOf enthält die DNs aller Gruppen des Users (aus GetUser/TestLogin).
  // Wir vergleichen den CN-Teil des DN gegen die konfigurierten Gruppennamen.
  if (memberOf.length > 0 && (GROUP_LEAD || GROUP_ADMIN || GROUP_HELPDESK)) {
    // CN aus DN extrahieren: "CN=GRP_ADManager_Lead,OU=..." → "GRP_ADManager_Lead"
    const groupNames = memberOf.map(dn => {
      const match = dn.match(/^CN=([^,]+)/i);
      return match ? match[1].toLowerCase() : "";
    });

    if (GROUP_LEAD   && groupNames.includes(GROUP_LEAD.toLowerCase()))   return ROLES.IT_LEAD;
    if (GROUP_ADMIN  && groupNames.includes(GROUP_ADMIN.toLowerCase()))  return ROLES.IT_ADMIN;
    if (GROUP_HELPDESK && groupNames.includes(GROUP_HELPDESK.toLowerCase())) return ROLES.HELPDESK;

    // In keiner RBAC-Gruppe → kein Zugang
    return ROLES.HELPDESK;
  }

  // ── Fallback: .env-Listen ─────────────────────────────────────────────────
  const leads    = (process.env.RBAC_IT_LEADS  || "").split(",").map(s => s.trim().toLowerCase());
  const admins   = (process.env.RBAC_IT_ADMINS || "").split(",").map(s => s.trim().toLowerCase());
  const helpdesk = (process.env.RBAC_HELPDESK  || "").split(",").map(s => s.trim().toLowerCase());
  const sam      = samAccountName.toLowerCase();

  if (leads.includes(sam))    return ROLES.IT_LEAD;
  if (admins.includes(sam))   return ROLES.IT_ADMIN;
  if (helpdesk.includes(sam)) return ROLES.HELPDESK;

  return ROLES.HELPDESK;
}

/**
 * Prüft ob eine Rolle eine bestimmte Berechtigung hat.
 */
function hasPermission(role, permission) {
  const perms = PERMISSIONS[role] || PERMISSIONS[ROLES.HELPDESK];
  return perms.includes(permission);
}

// ─── Express-Middleware ───────────────────────────────────────────────────────

/**
 * Gibt eine Middleware zurück die prüft ob der eingeloggte User
 * die geforderte Berechtigung hat.
 *
 * Verwendung in Routen:
 *   router.post("/:sam/disable", requirePermission("user:disable"), async (req, res) => { ... })
 */
function requirePermission(permission) {
  return (req, res, next) => {
    const role = req.session?.user?.role;
    if (!role) {
      return res.status(401).json({ error: "Nicht angemeldet." });
    }
    if (!hasPermission(role, permission)) {
      // Zugriff verweigert – in Audit-Log schreiben
      req.audit?.log({
        action:     "ACCESS_DENIED",
        target:     req.path,
        targetType: "route",
        result:     "failure",
        details:    { requiredPermission: permission, userRole: role },
      });
      return res.status(403).json({
        error: `Fehlende Berechtigung: ${permission}`,
      });
    }
    next();
  };
}

module.exports = {
  ROLES,
  PERMISSIONS,
  getRoleForUser,
  hasPermission,
  requirePermission,
};