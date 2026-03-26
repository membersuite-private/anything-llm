/**
 * Anthropic OAuth endpoints for "Sign in with Claude" flow.
 */
const {
  startOAuthFlow,
  waitForOAuthCallback,
  cancelOAuthFlow,
  hasActiveSession,
  refreshAccessToken,
} = require("../utils/AiProviders/anthropic/oauth");
const {
  loadTokens,
  saveTokens,
  clearTokens,
  getValidAccessToken,
} = require("../utils/AiProviders/anthropic/tokenStorage");

function anthropicOAuthEndpoints(app) {
  if (!app) return;

  /**
   * Start OAuth flow — returns authorize URL for browser.
   * Frontend should open this URL in the user's default browser.
   */
  app.get("/anthropic-oauth/start", async (_req, res) => {
    try {
      // Cancel any existing session
      cancelOAuthFlow();

      const { authorizeUrl } = await startOAuthFlow();

      // Start waiting for callback in background
      waitForOAuthCallback(300000) // 5 min timeout
        .then((tokens) => {
          saveTokens(tokens);
          console.log("Anthropic OAuth: tokens received and saved.");
        })
        .catch((err) => {
          console.error("Anthropic OAuth callback error:", err.message);
        });

      return res.status(200).json({
        success: true,
        authorizeUrl,
      });
    } catch (error) {
      console.error("OAuth start error:", error);
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * Check OAuth status — is user authenticated?
   * Frontend polls this after opening the authorize URL.
   */
  app.get("/anthropic-oauth/status", async (_req, res) => {
    try {
      const tokens = loadTokens();
      if (!tokens) {
        return res.status(200).json({
          authenticated: false,
          pending: hasActiveSession(),
        });
      }

      const isExpired = tokens.expiresAt && Date.now() >= tokens.expiresAt;
      return res.status(200).json({
        authenticated: true,
        pending: false,
        expired: isExpired,
        expiresAt: tokens.expiresAt,
      });
    } catch (error) {
      return res.status(500).json({
        authenticated: false,
        error: error.message,
      });
    }
  });

  /**
   * Refresh the OAuth token manually.
   */
  app.post("/anthropic-oauth/refresh", async (_req, res) => {
    try {
      const tokens = loadTokens();
      if (!tokens || !tokens.refreshToken) {
        return res.status(400).json({
          success: false,
          error: "No refresh token available. Please sign in again.",
        });
      }

      const newTokens = await refreshAccessToken(tokens.refreshToken);
      saveTokens(newTokens);

      return res.status(200).json({
        success: true,
        expiresAt: newTokens.expiresAt,
      });
    } catch (error) {
      console.error("OAuth refresh error:", error);
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * Logout — clear stored tokens.
   */
  app.post("/anthropic-oauth/logout", async (_req, res) => {
    try {
      cancelOAuthFlow();
      clearTokens();
      return res.status(200).json({ success: true });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * Get a valid access token (for internal use by Anthropic provider).
   * Auto-refreshes if expired.
   */
  app.get("/anthropic-oauth/token", async (_req, res) => {
    try {
      const token = await getValidAccessToken();
      if (!token) {
        return res.status(401).json({
          success: false,
          error: "Not authenticated. Please sign in with Claude.",
        });
      }
      return res.status(200).json({ success: true, hasToken: true });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });
}

module.exports = { anthropicOAuthEndpoints };