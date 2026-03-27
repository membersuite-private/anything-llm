/**
 * Anthropic OAuth flow (Claude Teams/Pro/Max)
 * Ported from GrowthZone-Pi-Mono/packages/ai/src/utils/oauth/anthropic.ts
 *
 * Flow:
 * 1. Generate PKCE verifier/challenge
 * 2. Start local callback server on port 53692
 * 3. Build authorize URL → user opens in browser
 * 4. User authenticates on claude.ai
 * 5. Callback receives authorization code
 * 6. Exchange code for access_token + refresh_token
 * 7. Store tokens — access_token works as Anthropic API key
 */
const http = require("http");
const { generatePKCE } = require("./pkce");

// Public OAuth client ID — this is NOT a secret (it's sent in URLs)
const CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const AUTHORIZE_URL = "https://claude.ai/oauth/authorize";
const TOKEN_URL = "https://platform.claude.com/v1/oauth/token";
const CALLBACK_HOST = "127.0.0.1";
const CALLBACK_PORT = 53692;
const CALLBACK_PATH = "/callback";
const REDIRECT_URI = `http://localhost:${CALLBACK_PORT}${CALLBACK_PATH}`;
const SCOPES =
  "org:create_api_key user:profile user:inference user:sessions:claude_code user:mcp_servers user:file_upload";

// In-memory state for active OAuth sessions
let activeSession = null;

/**
 * Start the local callback server that receives the OAuth redirect.
 * Returns a promise that resolves when the code is received.
 */
function startCallbackServer(expectedState) {
  return new Promise((resolve, reject) => {
    let settleWait;
    const waitForCodePromise = new Promise((resolveWait) => {
      let settled = false;
      settleWait = (value) => {
        if (settled) return;
        settled = true;
        resolveWait(value);
      };
    });

    const successHtml = `<!DOCTYPE html><html><head><title>GrowthZone Intelligence</title>
      <style>body{font-family:system-ui;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#1a1a2e;color:#fff}
      .card{text-align:center;padding:2rem;border-radius:12px;background:#16213e;box-shadow:0 4px 20px rgba(0,0,0,0.3)}
      h1{color:#4ade80;margin-bottom:0.5rem}p{color:#94a3b8}</style></head>
      <body><div class="card"><h1>&#10004; Connected!</h1><p>You can close this window and return to GrowthZone Intelligence.</p></div></body></html>`;

    const errorHtml = (msg) => `<!DOCTYPE html><html><head><title>Error</title>
      <style>body{font-family:system-ui;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#1a1a2e;color:#fff}
      .card{text-align:center;padding:2rem;border-radius:12px;background:#16213e}
      h1{color:#f87171}p{color:#94a3b8}</style></head>
      <body><div class="card"><h1>❌ Authentication Failed</h1><p>${msg}</p></div></body></html>`;

    const server = http.createServer((req, res) => {
      try {
        const url = new URL(req.url || "", "http://localhost");
        if (url.pathname !== CALLBACK_PATH) {
          res.writeHead(404, { "Content-Type": "text/html" });
          res.end(errorHtml("Route not found."));
          return;
        }

        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");

        if (error) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end(errorHtml(`Error: ${error}`));
          return;
        }

        if (!code || !state) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end(errorHtml("Missing code or state parameter."));
          return;
        }

        if (state !== expectedState) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end(errorHtml("State mismatch — possible CSRF attack."));
          return;
        }

        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(successHtml);
        settleWait({ code, state });
      } catch (err) {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Internal error");
      }
    });

    server.on("error", (err) => {
      reject(err);
    });

    server.listen(CALLBACK_PORT, CALLBACK_HOST, () => {
      resolve({
        server,
        redirectUri: REDIRECT_URI,
        cancelWait: () => settleWait(null),
        waitForCode: () => waitForCodePromise,
      });
    });
  });
}

/**
 * Exchange authorization code for tokens.
 */
async function exchangeAuthorizationCode(code, state, verifier, redirectUri) {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: CLIENT_ID,
      code,
      state,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    }),
    signal: AbortSignal.timeout(30000),
  });

  const responseBody = await response.text();
  if (!response.ok) {
    console.error('[OAuth] Token exchange error body (not exposed to client):', responseBody);
    throw new Error(`Token exchange failed (HTTP ${response.status}). Check server logs for details.`);
  }

  const tokenData = JSON.parse(responseBody);
  return {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    expiresAt: Date.now() + tokenData.expires_in * 1000 - 5 * 60 * 1000,
  };
}

/**
 * Refresh an expired access token.
 */
async function refreshAccessToken(refreshToken) {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: CLIENT_ID,
      refresh_token: refreshToken,
    }),
    signal: AbortSignal.timeout(30000),
  });

  const responseBody = await response.text();
  if (!response.ok) {
    console.error('[OAuth] Token refresh error body (not exposed to client):', responseBody);
    throw new Error(`Token refresh failed (HTTP ${response.status}). Check server logs for details.`);
  }

  const data = JSON.parse(responseBody);
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000 - 5 * 60 * 1000,
  };
}

/**
 * Check if a port is available.
 */
function isPortAvailable(port) {
  const net = require("net");
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close();
      resolve(true);
    });
    server.listen(port, CALLBACK_HOST);
  });
}

/**
 * Start the OAuth login flow.
 * Returns the authorize URL for the browser and the PKCE verifier for later exchange.
 */
async function startOAuthFlow() {
  // Check if callback port is available (Pi may be using it)
  const portFree = await isPortAvailable(CALLBACK_PORT);
  if (!portFree) {
    throw new Error(
      `OAuth callback port ${CALLBACK_PORT} is already in use (likely by Pi or another Claude OAuth session). ` +
      `Please close Pi or any other application using port ${CALLBACK_PORT} and try again.`
    );
  }

  const { verifier, challenge } = generatePKCE();
  const state = require("crypto").randomBytes(32).toString("base64url");
  const callbackServer = await startCallbackServer(state);

  const authParams = new URLSearchParams({
    code: "true",
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: state,
  });

  const authorizeUrl = `${AUTHORIZE_URL}?${authParams.toString()}`;

  // Store session state
  activeSession = {
    verifier,
    state,
    callbackServer,
    authorizeUrl,
    startedAt: Date.now(),
  };

  return { authorizeUrl, verifier };
}

/**
 * Wait for the OAuth callback and exchange for tokens.
 * Call after startOAuthFlow() — blocks until user completes auth or timeout.
 * The callback server is closed immediately after — never holds the port.
 */
async function waitForOAuthCallback(timeoutMs = 120000) {
  if (!activeSession) {
    throw new Error("No active OAuth session. Call startOAuthFlow() first.");
  }

  const { verifier, callbackServer } = activeSession;
  let timer;

  try {
    // Wait for callback with timeout — timer is cleared on completion
    const result = await Promise.race([
      callbackServer.waitForCode(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("OAuth timeout — user did not complete authentication")), timeoutMs);
      }),
    ]);

    clearTimeout(timer);

    if (!result || !result.code) {
      throw new Error("No authorization code received.");
    }

    // Close the callback server IMMEDIATELY — don't hold the port
    callbackServer.server.close();

    // Exchange code for tokens
    const tokens = await exchangeAuthorizationCode(
      result.code,
      result.state,
      verifier,
      REDIRECT_URI
    );

    return tokens;
  } finally {
    clearTimeout(timer);
    // Always clean up — close server and release port
    try { callbackServer.server.close(); } catch {}
    activeSession = null;
  }
}

/**
 * Cancel an active OAuth session.
 */
function cancelOAuthFlow() {
  if (activeSession) {
    activeSession.callbackServer.cancelWait();
    activeSession.callbackServer.server.close();
    activeSession = null;
  }
}

/**
 * Check if there's an active OAuth session waiting for callback.
 */
function hasActiveSession() {
  return activeSession !== null;
}

module.exports = {
  startOAuthFlow,
  waitForOAuthCallback,
  cancelOAuthFlow,
  hasActiveSession,
  refreshAccessToken,
  exchangeAuthorizationCode,
  CLIENT_ID,
  AUTHORIZE_URL,
  TOKEN_URL,
  REDIRECT_URI,
  SCOPES,
};