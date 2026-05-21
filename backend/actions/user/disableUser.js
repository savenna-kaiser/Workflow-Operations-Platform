/**
 * disableUser.js – Action: Benutzer deaktivieren & in _Inactive verschieben
 *
 * Entspricht dem BtnDisable-Handler aus Tab1.AD-Management.ps1.
 * Die Action kennt keine HTTP-Schicht – sie bekommt reine Daten rein
 * und schreibt über req.audit ins Audit-Log.
 */

const { ACTION_TYPES } = require("../../services/auditLog");
const adClient         = require("../../services/adClient");

async function execute({ sam }, audit, credential) {
  try {
    const data = await adClient.disableUser(sam, credential);
    audit.log({
      action:     ACTION_TYPES.USER_DISABLE,
      target:     sam,
      targetType: "user",
      result:     "success",
      details:    { originalOU: data.originalOU },
    });
    return data;
  } catch (err) {
    audit.log({ action: ACTION_TYPES.USER_DISABLE, target: sam, targetType: "user",
                result: "failure", error: err.message });
    throw err;
  }
}

module.exports = { execute };
