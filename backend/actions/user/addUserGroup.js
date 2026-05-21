const { ACTION_TYPES } = require("../../services/auditLog");
const adClient         = require("../../services/adClient");

async function execute({ sam, groupDn }, audit, credential) {
  try {
    await adClient.addGroupMember(groupDn, sam, credential);
    audit.log({ action: ACTION_TYPES.GROUP_ADD, target: sam, targetType: "user",
                result: "success", details: { groupDn } });
    return { sam, groupDn };
  } catch (err) {
    audit.log({ action: ACTION_TYPES.GROUP_ADD, target: sam, targetType: "user",
                result: "failure", error: err.message, details: { groupDn } });
    throw err;
  }
}
module.exports = { execute };
