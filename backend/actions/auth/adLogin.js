/**
 * adLogin.js – AD-Credentials testen
 * Liegt in auth/ – adClient ist in services/
 */

const adClient = require("../../services/adClient");

async function execute({ username, password }) {
  if (!username || !password) throw new Error("Benutzername und Passwort erforderlich.");

  const user = await adClient.testLogin(username, password);

  return {
    samAccountName: user.sam,
    displayName:    user.displayName || user.sam,
    memberOf:       user.memberOf    || [],
    credential: {
      username: username.includes("\\") ? username : `${process.env.AD_DOMAIN || "COMPANY"}\\${username}`,
      password,
    },
  };
}

module.exports = { execute };