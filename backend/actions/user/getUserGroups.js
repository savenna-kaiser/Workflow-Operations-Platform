const adClient = require("../../services/adClient");
async function execute({ sam }, audit, credential) {
  return adClient.getUserGroups(sam, credential);
}
module.exports = { execute };
