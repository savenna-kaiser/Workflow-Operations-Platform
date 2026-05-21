/**
 * credentialCrypto.js – Verschlüsselt/Entschlüsselt Credentials für die Session
 * Verwendet AES-256-GCM (authentifizierte Verschlüsselung).
 */

const crypto = require("crypto");
const ALGORITHM = "aes-256-gcm";

function deriveKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET muss gesetzt sein.");
  return crypto.createHash("sha256").update(secret).digest();
}

function encryptCredential(credential) {
  const key    = deriveKey();
  const iv     = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(credential), "utf8"), cipher.final()]);
  const authTag   = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), encrypted.toString("base64")].join(":");
}

function decryptCredential(encrypted) {
  if (!encrypted) return null;
  try {
    const key = deriveKey();
    const [ivB64, tagB64, ctB64] = encrypted.split(":");
    const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]);
    return JSON.parse(plaintext.toString("utf8"));
  } catch {
    return null;
  }
}

module.exports = { encryptCredential, decryptCredential };