/**
 * adClient.js – Sauberes AD-API für die Actions
 *
 * Alle Actions importieren dieses Modul statt direkt mit der Bridge zu sprechen.
 * Hier steckt die gesamte AD-Logik (Parameter-Aufbau, OU-Listen, Fehlerbehandlung).
 */

const { getPool } = require("./powershellBridge");

const DC = process.env.AD_DC || "company.internal";

// OU-Liste direkt hier pflegen – übersichtlicher als eine lange .env-Zeile
const OU_LIST = [
  "OU=CORP-AD,DC=company,DC=internal",
  "OU=CORP-BUE,DC=company,DC=internal",
  "OU=CORP-EL,DC=company,DC=internal",
  "OU=CORP-KL,DC=company,DC=internal",
  "OU=CORP-MU,DC=company,DC=internal",
  "OU=CORP-RI,DC=company,DC=internal",
  "OU=CORP-RO,DC=company,DC=internal",
  "OU=CORP-RT,DC=company,DC=internal",
  "OU=AdminUsers,DC=company,DC=internal",
  "OU=External,DC=company,DC=internal",
  "OU=Users,OU=_Inactive,DC=company,DC=internal",
];

const COMPUTER_OU_LIST = [
  "OU=COMPUTER,DC=company,DC=internal",
  "OU=Computers,OU=_Inactive,DC=company,DC=internal",
];

const GROUP_OUS = [
  process.env.AD_PRINTER_OU  || "OU=Druckergruppen,DC=company,DC=internal",
  process.env.AD_GROUP_OU    || "OU=GROUP,DC=company,DC=internal",
  process.env.AD_EXCHANGE_OU || "OU=Verteiler,OU=Exchange,DC=company,DC=internal",
];

const INACTIVE_USERS_OU    = process.env.AD_INACTIVE_USERS_OU    || "OU=Users,OU=_Inactive,DC=company,DC=internal";
const INACTIVE_COMPUTERS_OU= process.env.AD_INACTIVE_COMPUTERS_OU|| "OU=Computers,OU=_Inactive,DC=company,DC=internal";

// ─── Interner Helfer ─────────────────────────────────────────────────────────

async function run(cmd, params, credential = null) {
  const pool   = await getPool();
  const result = await pool.run(cmd, params, credential);
  if (!result.ok) throw new Error(result.error || `PS-Fehler bei ${cmd}`);
  return result.data;
}

// ─── Auth ────────────────────────────────────────────────────────────────────

/**
 * Testet AD-Credentials und gibt User-Infos zurück.
 * @param {string} username  – "DOMAIN\user" oder nur "user"
 * @param {string} password
 */
async function testLogin(username, password) {
  const sam = username.includes("\\") ? username.split("\\")[1] : username;
  const fqUser = username.includes("\\") ? username : `COMPANY\\${username}`;

  return run("TestLogin",
    { sam },
    { username: fqUser, password }
  );
}

// ─── Benutzer ────────────────────────────────────────────────────────────────

async function searchUsers(query, credential) {
  return run("SearchUsers", { query, ouList: OU_LIST }, credential);
}

/**
 * FIX #1: createUser war referenziert in processTopdeskChanges aber fehlte komplett.
 * Initielles Passwort aus ENV (muss bei erstem Login geändert werden).
 */
async function createUser({ sam, firstName, lastName, displayName, email, phoneNumber, department, targetOU, enabled }, credential) {
  const initialPassword = process.env.AD_NEW_USER_INITIAL_PASSWORD;
  if (!initialPassword) throw new Error("AD_NEW_USER_INITIAL_PASSWORD nicht konfiguriert.");
  return run("CreateUser", {
    sam, firstName, lastName, displayName, email: email || "",
    phoneNumber: phoneNumber || "", department: department || "",
    targetOU, enabled: enabled !== false,
    initialPassword,
  }, credential);
}

/** Liest einen einzelnen User aus AD – für Idempotency-Prüfungen */
async function getUser(sam, credential) {
  return run("GetUser", { sam }, credential);
}

async function enableUser(sam, targetOU, credential) {
  return run("EnableUser", { sam, targetOU: targetOU || null }, credential);
}

async function disableUser(sam, credential) {
  return run("DisableUser", { sam, targetOU: INACTIVE_USERS_OU }, credential);
}

async function unlockUser(sam, credential) {
  return run("UnlockUser", { sam }, credential);
}

/**
 * @param {string}  sam
 * @param {string}  newPassword   – wird nur an PS übergeben, nie geloggt
 * @param {boolean} mustChange
 * @param {boolean} cannotChange
 */
async function resetPassword(sam, newPassword, mustChange, cannotChange, credential) {
  return run("ResetPassword", { sam, newPassword, mustChange, cannotChange }, credential);
}

/**
 * @param {string} sam
 * @param {object} changes  – { GivenName, Surname, DisplayName, Title, Department,
 *                             Office, TelephoneNumber, MobilePhone, Description,
 *                             AccountExpires }
 */
async function editUser(sam, changes, credential) {
  return run("EditUser", { sam, changes }, credential);
}

async function getUserGroups(sam, credential) {
  return run("GetUserGroups", { sam }, credential);
}

async function getAllGroups(credential) {
  return run("GetAllGroups", { ouList: GROUP_OUS }, credential);
}

async function addGroupMember(groupDn, sam, credential) {
  return run("AddGroupMember", { groupDn, sam }, credential);
}

async function removeGroupMember(groupDn, sam, credential) {
  return run("RemoveGroupMember", { groupDn, sam }, credential);
}

// ─── Computer ────────────────────────────────────────────────────────────────

async function searchComputers(query, credential) {
  return run("SearchComputers", { query, ouList: COMPUTER_OU_LIST }, credential);
}

async function disableComputer(name, credential) {
  return run("DisableComputer", { name, targetOU: INACTIVE_COMPUTERS_OU }, credential);
}

async function enableComputer(name, targetOU, credential) {
  return run("EnableComputer", { name, targetOU: targetOU || null }, credential);
}

// ─── Export ──────────────────────────────────────────────────────────────────

module.exports = {
  testLogin,
  createUser,
  getUser,
  searchUsers,
  enableUser,
  disableUser,
  unlockUser,
  resetPassword,
  editUser,
  getUserGroups,
  getAllGroups,
  addGroupMember,
  removeGroupMember,
  searchComputers,
  disableComputer,
  enableComputer,
};