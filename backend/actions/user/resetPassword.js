const { ACTION_TYPES } = require("../../services/auditLog");
const adClient         = require("../../services/adClient");

async function execute({ sam, newPassword, mustChange, cannotChange }, audit, credential) {
  try {
    await adClient.resetPassword(sam, newPassword, mustChange, cannotChange, credential);
    // PASSWORT wird NIEMALS geloggt – nur Optionen
    audit.log({ action: ACTION_TYPES.USER_RESET_PWD, target: sam, targetType: "user",
                result: "success", details: { mustChange, cannotChange } });
    return { sam };
  } catch (err) {
    audit.log({ action: ACTION_TYPES.USER_RESET_PWD, target: sam, targetType: "user",
                result: "failure", error: err.message });
    throw err;
  }
}
module.exports = { execute };
