const { ACTION_TYPES } = require("../../services/auditLog");
const adClient         = require("../../services/adClient");

async function execute({ query }, audit, credential) {
  try {
    const results = await adClient.searchUsers(query, credential);
    audit.log({ action: ACTION_TYPES.USER_SEARCH, target: query, targetType: "user",
                result: "success", details: { count: results.length } });
    return results;
  } catch (err) {
    audit.log({ action: ACTION_TYPES.USER_SEARCH, target: query, targetType: "user",
                result: "failure", error: err.message });
    throw err;
  }
}
module.exports = { execute };
