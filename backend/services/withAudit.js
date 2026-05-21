/**
 * withAudit.js – Higher-Order-Function für auditiertes Ausführen von AD-Aktionen
 *
 * Eliminiert den try/catch-Boilerplate aus allen Actions.
 * Schreibt bei Erfolg und Fehler automatisch ins Audit-Log.
 *
 * @param {Function} fn           – async Funktion die die eigentliche AD-Aktion ausführt
 * @param {object}   meta         – { action, target, targetType, details? }
 * @param {object}   audit        – req.audit Kontext
 * @returns {Promise<any>}        – Ergebnis von fn()
 */
async function withAudit(fn, { action, target, targetType, details = {} }, audit) {
  try {
    const result = await fn();
    audit.log({ action, target, targetType, result: "success", details });
    return result;
  } catch (err) {
    audit.log({ action, target, targetType, result: "failure", error: err.message, details });
    throw err;
  }
}

module.exports = { withAudit };