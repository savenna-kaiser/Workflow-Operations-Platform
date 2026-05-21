const { ACTION_TYPES } = require("../../services/auditLog");
const adClient         = require("../../services/adClient");

async function execute({ sam, targetOU }, audit, credential) {
  try {
    const data = await adClient.enableUser(sam, targetOU, credential);
    audit.log({ action: ACTION_TYPES.USER_ENABLE, target: sam, targetType: "user",
                result: "success", details: { movedTo: targetOU || "original OU" } });
    return data;
  } catch (err) {
    audit.log({ action: ACTION_TYPES.USER_ENABLE, target: sam, targetType: "user",
                result: "failure", error: err.message });
    throw err;
  }
}
module.exports = { execute };
