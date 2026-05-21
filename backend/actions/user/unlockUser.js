const { ACTION_TYPES } = require("../../services/auditLog");
const adClient         = require("../../services/adClient");

async function execute({ sam }, audit, credential) {
  try {
    await adClient.unlockUser(sam, credential);
    audit.log({ action: ACTION_TYPES.USER_UNLOCK, target: sam, targetType: "user", result: "success" });
    return { sam };
  } catch (err) {
    audit.log({ action: ACTION_TYPES.USER_UNLOCK, target: sam, targetType: "user",
                result: "failure", error: err.message });
    throw err;
  }
}
module.exports = { execute };
