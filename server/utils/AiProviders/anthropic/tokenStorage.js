/**
 * Simple file-based storage for Anthropic OAuth tokens.
 * Stored at storage/anthropic_oauth.json alongside the main DB.
 */
const fs = require("fs");
const path = require("path");

function getTokenPath() {
  // AnythingLLM stores data in process.env.STORAGE_DIR or ../storage
  const storageDir = process.env.STORAGE_DIR || 
    path.resolve(__dirname, "../../../../storage");
  return path.join(storageDir, "anthropic_oauth.json");
}

function loadTokens() {
  try {
    const tokenPath = getTokenPath();
    if (!fs.existsSync(tokenPath)) return null;
    const raw = fs.readFileSync(tokenPath, "utf-8");

    // Try to decrypt first (encrypted format)
    try {
      const EncryptionManager = require("../../EncryptionManager");
      const encMgr = new EncryptionManager();
      const decrypted = encMgr.decrypt(raw);
      return JSON.parse(decrypted);
    } catch {
      // Might be legacy plaintext — try direct JSON parse
      try {
        const data = JSON.parse(raw);
        // Migrate: re-save as encrypted
        saveTokens(data);
        return data;
      } catch {
        return null;
      }
    }
  } catch {
    return null;
  }
}

function saveTokens(tokens) {
  const tokenPath = getTokenPath();
  const dir = path.dirname(tokenPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  try {
    const EncryptionManager = require("../../EncryptionManager");
    const encMgr = new EncryptionManager();
    const encrypted = encMgr.encrypt(JSON.stringify(tokens));
    fs.writeFileSync(tokenPath, encrypted, "utf-8");
  } catch {
    // Fallback to plaintext if encryption not available
    fs.writeFileSync(tokenPath, JSON.stringify(tokens, null, 2), "utf-8");
  }
  try { fs.chmodSync(tokenPath, 0o600); } catch {}
}

function clearTokens() {
  try {
    const tokenPath = getTokenPath();
    if (fs.existsSync(tokenPath)) fs.unlinkSync(tokenPath);
  } catch {}
}

/**
 * Get a valid access token, refreshing if needed.
 * Returns null if not authenticated.
 */
async function getValidAccessToken() {
  const tokens = loadTokens();
  if (!tokens) return null;

  // Check if token is still valid (with 5 min buffer)
  if (tokens.expiresAt && Date.now() < tokens.expiresAt) {
    return tokens.accessToken;
  }

  // Try to refresh
  if (tokens.refreshToken) {
    try {
      const { refreshAccessToken } = require("./oauth");
      const newTokens = await refreshAccessToken(tokens.refreshToken);
      saveTokens(newTokens);
      return newTokens.accessToken;
    } catch (err) {
      console.error("OAuth token refresh failed:", err.message);
      return null;
    }
  }

  return null;
}

module.exports = { loadTokens, saveTokens, clearTokens, getValidAccessToken, getTokenPath };