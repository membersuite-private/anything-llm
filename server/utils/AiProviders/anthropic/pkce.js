/**
 * PKCE (Proof Key for Code Exchange) generation for OAuth.
 * Used by Anthropic OAuth flow per RFC 7636.
 */
const crypto = require("crypto");

function generatePKCE() {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64url");
  return { verifier, challenge };
}

module.exports = { generatePKCE };