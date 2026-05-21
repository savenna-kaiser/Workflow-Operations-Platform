const { ACTION_TYPES } = require("../../services/auditLog");
const adClient         = require("../../services/adClient");

async function execute({ sam, changes }, audit, credential) {
  try {
    await adClient.editUser(sam, changes, credential);
    audit.log({ action: ACTION_TYPES.USER_EDIT, target: sam, targetType: "user",
                result: "success", details: { fields: Object.keys(changes) } });
    return { sam };
  } catch (err) {
    audit.log({ action: ACTION_TYPES.USER_EDIT, target: sam, targetType: "user",
                result: "failure", error: err.message });
    throw err;
  }
}
module.exports = { execute };
