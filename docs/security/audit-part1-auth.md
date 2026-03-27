# Security Audit — Part 1: Authentication, OAuth, Secrets & Session Management

**Repository:** gz-anything-llm (GrowthZone Intelligence — fork of AnythingLLM)  
**Auditor:** GZ Security Auditor Agent  
**Date:** 2026-03-27  
**Scope:** OAuth flow, secrets/API keys, session management, Electron security  
**Classification:** INTERNAL — DO NOT DISTRIBUTE EXTERNALLY

---

## Executive Summary

This audit examined the authentication and session management surface of GrowthZone Intelligence, a fork of AnythingLLM with 24 custom commits adding Anthropic OAuth, Electron desktop packaging, and branding changes. **11 findings** were identified: **2 Critical, 4 High, 3 Medium, 2 Low**.

The most severe issues are: (1) OAuth endpoints exposed without any authentication middleware, allowing any network-adjacent attacker to manipulate OAuth sessions; (2) the PKCE `state` parameter reuses the `verifier`, collapsing two independent security mechanisms into one; and (3) a production `.env` file with real secrets sitting in the working tree (untracked but risky).

| Severity | Count | Our Code | Upstream |
|----------|-------|----------|----------|
| Critical | 2     | 2        | 0        |
| High     | 4     | 2        | 2        |
| Medium   | 3     | 1        | 2        |
| Low      | 2     | 0        | 2        |
| **Total** | **11** | **5** | **4** + 2 shared |

---

## Findings

---

### [SEV-CRITICAL] F1: OAuth Endpoints Entirely Unauthenticated

**Category:** OWASP A01:2021 — Broken Access Control / CWE-306  
**Location:** `server/endpoints/anthropicOAuth.js:25-146`, `server/index.js:91`  
**CVSS:** 8.6 (High — network accessible, no authentication required)

**Description:**  
All five Anthropic OAuth endpoints (`/api/anthropic-oauth/start`, `/status`, `/refresh`, `/logout`, `/token`) are registered on `apiRouter` **without** any authentication middleware. The upstream AnythingLLM pattern routes everything through `validatedRequest` middleware, but the OAuth endpoints bypass this entirely.

Any process on the local network (or on the same machine) can:
- Trigger a new OAuth flow (`GET /api/anthropic-oauth/start`)
- Read authentication status (`GET /api/anthropic-oauth/status`)
- Force a token refresh (`POST /api/anthropic-oauth/refresh`)
- Logout the user destroying their session (`POST /api/anthropic-oauth/logout`)
- Check token validity (`GET /api/anthropic-oauth/token`)

**Exploit Scenario:**
1. Attacker on same network discovers GZ Intelligence on port 3001 (default, no TLS)
2. Attacker calls `POST /api/anthropic-oauth/logout` — destroys victim's OAuth session
3. Attacker calls `GET /api/anthropic-oauth/start` — initiates a new OAuth flow
4. If the attacker can social-engineer the user to click the new authorize URL, the tokens are stored server-side and usable by the attacker via `GET /api/anthropic-oauth/status`

**Evidence:**
```javascript
// server/index.js:91 — registered directly on apiRouter, no middleware
anthropicOAuthEndpoints(apiRouter);

// server/endpoints/anthropicOAuth.js:25 — no auth check
app.get("/anthropic-oauth/start", async (_req, res) => {
```

Compare with how other endpoints are protected:
```javascript
// Other endpoints use validatedRequest middleware
app.get("/some-endpoint", [validatedRequest], handler);
```

**Remediation:**
```javascript
// Wrap OAuth endpoints with validatedRequest middleware
const { validatedRequest } = require("../utils/middleware/validatedRequest");

app.get("/anthropic-oauth/start", [validatedRequest], async (_req, res) => { ... });
app.get("/anthropic-oauth/status", [validatedRequest], async (_req, res) => { ... });
app.post("/anthropic-oauth/refresh", [validatedRequest], async (_req, res) => { ... });
app.post("/anthropic-oauth/logout", [validatedRequest], async (_req, res) => { ... });
app.get("/anthropic-oauth/token", [validatedRequest], async (_req, res) => { ... });
```

**Priority:** Immediate  
**[OUR CODE]** — Introduced in commits `8722a047`, `094a070e`

---

### [SEV-CRITICAL] F2: OAuth `state` Parameter Reuses PKCE Verifier — CSRF Protection Collapsed

**Category:** OWASP A07:2021 — Identification and Authentication Failures / CWE-352  
**Location:** `server/utils/AiProviders/anthropic/oauth.js:225-227`  
**CVSS:** 7.4 (High)

**Description:**  
The OAuth `state` parameter — designed to prevent CSRF attacks — is set to the **same value** as the PKCE `code_verifier`. This collapses two independent security mechanisms into one:

1. **`state`** prevents CSRF: the server checks the callback `state` matches what it sent.  
2. **`code_verifier`** (PKCE RFC 7636) proves the entity that started the flow is the one exchanging the code.

By reusing the verifier as the state, the state value is transmitted to the authorization server in the redirect URL, **leaking the PKCE verifier** to any intermediary (browser history, referrer headers, proxy logs). An attacker who observes the authorization URL can extract the verifier and potentially race to exchange the authorization code.

**Evidence:**
```javascript
// oauth.js:220-228
const { verifier, challenge } = generatePKCE();
const callbackServer = await startCallbackServer(verifier); // state = verifier

const authParams = new URLSearchParams({
  // ...
  code_challenge: challenge,
  code_challenge_method: "S256",
  state: verifier,  // ← PKCE verifier used as state parameter!
});
```

The callback server validates `state !== expectedState` where expectedState IS the verifier:
```javascript
// oauth.js:84 — startCallbackServer(expectedState) where expectedState = verifier
if (state !== expectedState) {
  res.end(errorHtml("State mismatch — possible CSRF attack."));
}
```

**Exploit Scenario:**
1. User initiates OAuth flow — the authorize URL contains `state=<verifier>` in the query string
2. This URL is visible in browser history, could appear in referrer headers, proxy logs, or shoulder-surfing
3. Attacker extracts the verifier from the URL
4. If the attacker can intercept the authorization code (e.g., on a shared machine), they can exchange it using the known verifier

**Remediation:**
Generate a separate random `state` value independent of the PKCE verifier:
```javascript
const { verifier, challenge } = generatePKCE();
const state = crypto.randomBytes(32).toString("base64url"); // separate!
const callbackServer = await startCallbackServer(state);

// Store verifier separately for token exchange
activeSession = { verifier, state, callbackServer, ... };

const authParams = new URLSearchParams({
  state: state,           // independent state
  code_challenge: challenge,
  code_challenge_method: "S256",
  // ...
});
```

**Priority:** Immediate  
**[OUR CODE]** — Introduced in commit `b2dca5f4`

---

### [SEV-HIGH] F3: OAuth Client ID Obfuscated via Base64 — False Sense of Security

**Category:** CWE-259: Use of Hard-coded Password / OWASP A07:2021  
**Location:** `server/utils/AiProviders/anthropic/oauth.js:18-21`  
**CVSS:** 5.3 (Medium — information disclosure)

**Description:**  
The Anthropic OAuth Client ID is "hidden" behind base64 encoding:
```javascript
const CLIENT_ID = Buffer.from(
  "OWQxYzI1MGEtZTYxYi00NGQ5LTg4ZWQtNTk0NGQxOTYyZjVl",
  "base64"
).toString();
// Decodes to: 9d1c250a-e61b-44d9-88ed-5944d1962f5e
```

Base64 is **not encryption**. Any developer, code scanner, or attacker reading the source can decode this in seconds. The comment says "decoded from base64" acknowledging this. While a client ID alone isn't a secret in OAuth public client flows (which this is — no client_secret is used), the base64 encoding gives a false impression that something is being protected.

More importantly, this same Client ID is shared across GZ Intelligence and Pi (ported from pi-mono). If Anthropic revokes this client ID, both applications break simultaneously.

**Exploit Scenario:**  
No direct exploit, but the encoding creates false confidence and may lead developers to apply the same "protection" to actual secrets.

**Remediation:**
- Move CLIENT_ID to environment variable: `process.env.ANTHROPIC_OAUTH_CLIENT_ID`
- Remove base64 encoding — use the plaintext value
- Add a comment: "This is a public OAuth client ID, not a secret"

**Priority:** Next Release  
**[OUR CODE]** — Introduced in commit `b2dca5f4`

---

### [SEV-HIGH] F4: OAuth Token File Stored as Plaintext JSON on Disk

**Category:** CWE-312: Cleartext Storage of Sensitive Information / OWASP A02:2021  
**Location:** `server/utils/AiProviders/anthropic/tokenStorage.js:27-33`  
**CVSS:** 6.2 (Medium-High)

**Description:**  
OAuth access tokens and refresh tokens are stored in plaintext JSON at `storage/anthropic_oauth.json`. While `chmod 0o600` is applied (good), the tokens are not encrypted at rest. The file contains:
- `accessToken` — equivalent to an API key for the user's Anthropic account
- `refreshToken` — can generate new access tokens indefinitely
- `expiresAt` — timestamp

If an attacker gains read access to the filesystem (directory traversal, backup exposure, misconfigured container volume, or physical access to the desktop app), they obtain full API access to the user's Anthropic account.

**Evidence:**
```javascript
function saveTokens(tokens) {
  const tokenPath = getTokenPath();
  fs.writeFileSync(tokenPath, JSON.stringify(tokens, null, 2), "utf-8");
  try { fs.chmodSync(tokenPath, 0o600); } catch {} // Good, but not enough
}
```

**Remediation:**
1. Encrypt tokens at rest using the existing `EncryptionManager` (server/utils/EncryptionManager/index.js):
```javascript
const { EncryptionManager } = require("../../EncryptionManager");
const encryptionMgr = new EncryptionManager();

function saveTokens(tokens) {
  const encrypted = encryptionMgr.encrypt(JSON.stringify(tokens));
  fs.writeFileSync(tokenPath, encrypted, "utf-8");
  try { fs.chmodSync(tokenPath, 0o600); } catch {}
}

function loadTokens() {
  const encrypted = fs.readFileSync(tokenPath, "utf-8");
  return JSON.parse(encryptionMgr.decrypt(encrypted));
}
```
2. On the Electron desktop app, consider using `safeStorage` (Electron's OS keychain integration) instead of file storage.

**Priority:** Next Release  
**[OUR CODE]** — Introduced in commit `b2dca5f4`

---

### [SEV-HIGH] F5: Production `.env` File with Real API Key and Weak Secrets in Working Tree

**Category:** CWE-798: Use of Hard-coded Credentials / OWASP A07:2021  
**Location:** `server/.env` (not committed to git, but present on disk)  
**CVSS:** 7.5 (High)

**Description:**  
The `server/.env` file contains production-sensitive values:
```
ANTHROPIC_API_KEY='sk-ant-oauth-managed'
JWT_SECRET='my-random-string-for-seeding'
SIG_KEY='passphrase'
SIG_SALT='salt'
```

While this file is gitignored (good), the values are dangerously weak:
- `JWT_SECRET='my-random-string-for-seeding'` — this is the **example** value from `.env.example`, used verbatim. Any attacker who reads the public `.env.example` can forge JWTs.
- `SIG_KEY='passphrase'` and `SIG_SALT='salt'` — these are also the example values, providing zero cryptographic strength.

Additionally, `server/storage/.env` exists with partial config — this suggests env files may proliferate to unexpected locations.

**Exploit Scenario:**
1. Attacker reads the public `.env.example` on GitHub (upstream AnythingLLM repo)
2. Attacker assumes the instance uses default values (which it does)
3. Attacker forges a valid JWT using `jwt.sign({p: encrypted_auth_token}, 'my-random-string-for-seeding')`
4. Attacker authenticates to the API with full access

**Evidence:**
```
# server/.env
JWT_SECRET='my-random-string-for-seeding'
SIG_KEY='passphrase'
SIG_SALT='salt'
```

```
# server/.env.example (IDENTICAL values)
JWT_SECRET="my-random-string-for-seeding"
SIG_KEY='passphrase'
SIG_SALT='salt'
```

**Remediation:**
1. **Immediately** regenerate `JWT_SECRET`, `SIG_KEY`, and `SIG_SALT` with cryptographically random values:
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
   ```
2. Add a startup check that rejects known-weak/example values:
   ```javascript
   if (process.env.JWT_SECRET === 'my-random-string-for-seeding') {
     console.error("FATAL: JWT_SECRET is using the example value. Generate a random secret.");
     process.exit(1);
   }
   ```
3. Ensure `server/storage/.env` is also in `.gitignore`

**Priority:** Immediate  
**[SHARED — Upstream example values + Our deployment failure]**

---

### [SEV-HIGH] F6: Token Exchange Error Messages Leak Response Bodies

**Category:** CWE-209: Information Exposure Through Error Message / OWASP A04:2021  
**Location:** `server/utils/AiProviders/anthropic/oauth.js:140-141, 173-174`  
**CVSS:** 4.3

**Description:**  
When token exchange or refresh fails, the full response body from Anthropic's token endpoint is included in the error message:
```javascript
throw new Error(
  `Token exchange failed: status=${response.status} body=${responseBody}`
);
```

This error propagates to `server/endpoints/anthropicOAuth.js` where `error.message` is returned to the client:
```javascript
return res.status(500).json({
  success: false,
  error: error.message, // Includes full response body!
});
```

The Anthropic token endpoint response could contain:
- Internal error details
- Rate limit information useful for timing attacks
- Token fragments in error responses
- Server infrastructure details

**Remediation:**
```javascript
// oauth.js — sanitize error messages
throw new Error(`Token exchange failed (HTTP ${response.status})`);

// anthropicOAuth.js — never pass raw error.message to client
return res.status(500).json({
  success: false,
  error: "OAuth operation failed. Check server logs for details.",
});
```

Log the full response body server-side only:
```javascript
console.error(`Token exchange failed: status=${response.status}`, responseBody);
```

**Priority:** Next Release  
**[OUR CODE]** — Introduced in commit `b2dca5f4`

---

### [SEV-MEDIUM] F7: No Rate Limiting on Any API Endpoints

**Category:** OWASP A04:2021 — Insecure Design / CWE-307  
**Location:** `server/index.js` (global)  
**CVSS:** 5.3

**Description:**  
The application has no rate limiting middleware. Neither `express-rate-limit` nor any custom rate limiter is installed. This affects all endpoints, but is particularly dangerous for:
- OAuth endpoints (can be spammed to exhaust port 53692 or create excessive Anthropic sessions)
- Authentication endpoints (brute force password guessing in single-user mode)
- The `/api/anthropic-oauth/refresh` endpoint (can trigger excessive token refreshes, potentially flagging the account with Anthropic)

**Evidence:**
```bash
$ grep -r "rate.*limit\|rateLimit\|express-rate" server/ --include="*.js" --exclude-dir=node_modules
# No results for express-rate-limit or custom rate limiting middleware
```

**Remediation:**
```javascript
const rateLimit = require('express-rate-limit');

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
});

app.use("/api", apiLimiter);
app.use("/api/anthropic-oauth", authLimiter);
```

**Priority:** Next Release  
**[UPSTREAM]** — Not introduced by our commits, but exacerbated by OAuth endpoints

---

### [SEV-MEDIUM] F8: No Security Headers (CSP, HSTS, X-Frame-Options, etc.)

**Category:** OWASP A05:2021 — Security Misconfiguration / CWE-693  
**Location:** `server/index.js`  
**CVSS:** 4.7

**Description:**  
The server does not set any security headers. No `helmet`, no custom CSP, no X-Frame-Options, no Referrer-Policy. The application serves a full web UI that handles OAuth tokens and could be:
- Framed by malicious sites (clickjacking)
- Subject to MIME sniffing attacks
- Leaking referrer information during OAuth redirects

```bash
$ grep -r "helmet\|csp\|Content-Security-Policy" server/ --include="*.js" --exclude-dir=node_modules
# No results
```

**Remediation:**
```javascript
const helmet = require('helmet');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'", "https://api.anthropic.com", "https://platform.claude.com"],
    }
  },
  frameguard: { action: 'deny' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));
```

**Priority:** Next Release  
**[UPSTREAM]** — Not introduced by our commits

---

### [SEV-MEDIUM] F9: CORS Wildcard — `origin: true` Accepts All Origins

**Category:** OWASP A05:2021 — Security Misconfiguration / CWE-942  
**Location:** `server/index.js:54`  
**CVSS:** 5.0

**Description:**  
```javascript
app.use(cors({ origin: true }));
```

The `origin: true` setting reflects the requesting origin back in the `Access-Control-Allow-Origin` header, effectively allowing **any website** to make credentialed cross-origin requests. Combined with the unauthenticated OAuth endpoints (F1), any website the user visits could silently:
- Check their OAuth status
- Trigger logout
- Initiate a new OAuth flow

Additionally, individual stream endpoints explicitly set `Access-Control-Allow-Origin: *`.

**Remediation:**
```javascript
const allowedOrigins = [
  `http://localhost:${process.env.SERVER_PORT || 3001}`,
  'http://127.0.0.1:3001',
];
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));
```

**Priority:** Next Release  
**[UPSTREAM]** — `origin: true` is upstream, but our OAuth endpoints make this more dangerous

---

### [SEV-LOW] F10: JWT Expiry of 30 Days with No Rotation

**Category:** CWE-613: Insufficient Session Expiration / OWASP A07:2021  
**Location:** `server/utils/http/index.js:28`  
**CVSS:** 3.1

**Description:**  
JWTs are issued with a 30-day expiry and there is no token rotation mechanism:
```javascript
function makeJWT(info = {}, expiry = "30d") {
  return JWT.sign(info, process.env.JWT_SECRET, { expiresIn: expiry });
}
```

A stolen JWT remains valid for up to 30 days with no way to revoke it (no server-side token blacklist).

**Remediation:**
- Reduce default expiry to 24h for web sessions
- Implement token rotation on activity
- Add a server-side token blacklist/revocation for logout

**Priority:** Backlog  
**[UPSTREAM]**

---

### [SEV-LOW] F11: Development Auth Bypass in `validatedRequest` Middleware

**Category:** CWE-489: Active Debug Code / OWASP A05:2021  
**Location:** `server/utils/middleware/validatedRequest.js:15-21`  
**CVSS:** 3.7

**Description:**  
In single-user mode, if `NODE_ENV=development` OR if `AUTH_TOKEN` or `JWT_SECRET` is not set, authentication is **completely bypassed**:
```javascript
if (
  process.env.NODE_ENV === "development" ||
  !process.env.AUTH_TOKEN ||
  !process.env.JWT_SECRET
) {
  next(); // Authentication bypassed!
  return;
}
```

This is by design for development convenience, but combined with F5 (missing/weak secrets), if `JWT_SECRET` were accidentally unset in production, all authentication would be disabled.

**Remediation:**
- Add a startup guard that requires `JWT_SECRET` in production
- Log a warning when auth is bypassed
- Consider removing the `!AUTH_TOKEN || !JWT_SECRET` bypass and requiring explicit opt-in

**Priority:** Backlog  
**[UPSTREAM]**

---

## Electron Desktop Security Assessment

### F12 (INFO): Electron `webPreferences` — Properly Configured

**Location:** `desktop/main.js:56-59`

The Electron BrowserWindow is configured with security best practices:
```javascript
webPreferences: {
  nodeIntegration: false,  // ✅ Good — prevents renderer from accessing Node.js
  contextIsolation: true,  // ✅ Good — isolates preload from renderer
},
```

External link handling is also correct:
```javascript
mainWindow.webContents.setWindowOpenHandler(({ url }) => {
  shell.openExternal(url);
  return { action: "deny" }; // ✅ Prevents new windows in Electron
});
```

**Remaining concerns:**
- No `preload` script is used — while not needed, this means no secure bridge exists for future IPC needs
- No protocol handler registration — ✅ Good (no custom `app://` or `gz-intelligence://` protocol that could be exploited)
- No CSP in the BrowserWindow — the loaded content is from localhost, but adding CSP via `webPreferences.contentSecurityPolicy` would be defense-in-depth
- The server starts as a child process with `stdio: 'pipe'` — stdout/stderr are logged to console, which could leak tokens in Electron's DevTools if enabled

**[OUR CODE]** — Introduced in commit `d3892d14`. Generally well-implemented.

---

## Summary of Remediation Priorities

### Immediate (Before Next Deploy)
| # | Finding | Action |
|---|---------|--------|
| F1 | Unauthenticated OAuth endpoints | Add `validatedRequest` middleware |
| F2 | State = Verifier (PKCE collapse) | Generate separate state parameter |
| F5 | Default JWT_SECRET in production | Regenerate all secrets |

### Next Release
| # | Finding | Action |
|---|---------|--------|
| F3 | Base64 Client ID | Move to env var, remove encoding |
| F4 | Plaintext token storage | Encrypt with EncryptionManager |
| F6 | Error message leaking response body | Sanitize error responses |
| F7 | No rate limiting | Add express-rate-limit |
| F8 | No security headers | Add helmet |
| F9 | CORS wildcard | Restrict to localhost origins |

### Backlog
| # | Finding | Action |
|---|---------|--------|
| F10 | 30-day JWT with no rotation | Reduce expiry, add rotation |
| F11 | Dev auth bypass | Add startup guards |

---

## Methodology Notes

- **Static analysis** of all files in scope via direct source code review
- **Secret scanning** via `grep` for patterns: `sk-ant`, `sk-`, `api_key`, `password`, `secret`, `token`, base64 patterns
- **Git history analysis** for committed `.env` files and secret exposure
- **Dependency on upstream** — findings marked `[UPSTREAM]` exist in the base AnythingLLM codebase
- **Our commits** — findings marked `[OUR CODE]` were introduced in GrowthZone's 24 custom commits

---

*Part 2 will cover: Injection attacks, data flow analysis, dependency vulnerabilities, MCP server security, and LLM-specific attack surface.*
