# GrowthZone Intelligence — Branding + Claude Teams OAuth

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the AnythingLLM fork into "GrowthZone Intelligence" with GZ branding and Claude Teams OAuth login — so employees click "Sign in with Claude," authenticate with their Teams subscription, and get 39 reporting tools immediately.

**Architecture:** 
- Branding: Replace logos, app name, colors across frontend, Electron config, and installer
- OAuth: Port Anthropic OAuth PKCE flow from pi-mono (`packages/ai/src/utils/oauth/anthropic.ts`) into AnythingLLM's server-side auth + frontend onboarding
- MCP: Pre-configure GZ reporting MCP server in default config

**Source Reference:**
- OAuth flow: `GrowthZone-Pi-Mono/packages/ai/src/utils/oauth/anthropic.ts` (PKCE + token exchange)
- OAuth storage: `GrowthZone-Pi-Mono/packages/coding-agent/src/core/auth-storage.ts`
- Key constants: CLIENT_ID, AUTHORIZE_URL=`https://claude.ai/oauth/authorize`, TOKEN_URL=`https://platform.claude.com/v1/oauth/token`, CALLBACK_PORT=53692, SCOPES
- Token refresh: `refreshAnthropicToken()` using refresh_token grant

**Repo:** `/Users/christopherhughesgz/Documents/GrowthZone-Github/gz-anything-llm`
**Branch:** `feature/gz-branding-oauth`

---

## Task 1: Create Feature Branch + Branding Assets

**Files:**
- Copy logos to: `frontend/src/media/illustrations/`
- Copy favicon to: `frontend/public/`

**Step 1:** Create the branch
```bash
cd gz-anything-llm
git checkout -b feature/gz-branding-oauth
```

**Step 2:** Copy GZ logos
- `gz-logo.svg` → `frontend/src/media/illustrations/login-logo.svg` (dark mode)
- `gz-logo.svg` → `frontend/src/media/illustrations/login-logo-light.svg` (light mode)
- `gz-logomark.png` → `frontend/public/favicon.png`
- Generate `favicon.ico` from logomark

**Step 3:** Commit
```bash
git commit -m "brand: replace AnythingLLM logos with GrowthZone"
```

---

## Task 2: Rename App — "GrowthZone Intelligence"

**Files:**
- `package.json` (root) — name, productName, description
- `frontend/package.json` — name
- `server/package.json` — name
- `frontend/src/locales/en/common.js` — all "AnythingLLM" → "GrowthZone Intelligence"
- `frontend/index.html` or equivalent — page title
- Electron config if present — app name, window title

**Step 1:** Find and replace "AnythingLLM" → "GrowthZone Intelligence" across all config files

**Step 2:** Update the English locale (primary — other locales can follow)

**Step 3:** Commit
```bash
git commit -m "brand: rename AnythingLLM → GrowthZone Intelligence"
```

---

## Task 3: Anthropic OAuth — Server-Side Token Exchange

**Files:**
- Create: `server/utils/AiProviders/anthropic/oauth.js`
- Create: `server/utils/AiProviders/anthropic/pkce.js`

**Step 1:** Port PKCE generation from pi-mono
```javascript
// pkce.js — PKCE challenge/verifier generation
const crypto = require('crypto');

function generatePKCE() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}
module.exports = { generatePKCE };
```

**Step 2:** Port OAuth flow from pi-mono's `anthropic.ts`
```javascript
// oauth.js — Anthropic OAuth PKCE flow
// Constants from pi-mono:
const CLIENT_ID = Buffer.from('OWQxYzI1MGEtZTYxYi00NGQ5LTg4ZWQtNTk0NGQxOTYyZjVl', 'base64').toString();
const AUTHORIZE_URL = 'https://claude.ai/oauth/authorize';
const TOKEN_URL = 'https://platform.claude.com/v1/oauth/token';
const CALLBACK_PORT = 53692;
const REDIRECT_URI = `http://localhost:${CALLBACK_PORT}/callback`;
const SCOPES = 'org:create_api_key user:profile user:inference';

// Functions: startCallbackServer(), exchangeAuthorizationCode(), 
// loginAnthropic(), refreshAnthropicToken()
// Port directly from anthropic.ts, converting TypeScript → CommonJS
```

**Step 3:** Commit
```bash
git commit -m "feat: Anthropic OAuth PKCE flow — ported from pi-mono"
```

---

## Task 4: Anthropic OAuth — API Endpoints

**Files:**
- Create: `server/endpoints/anthropicOAuth.js`
- Modify: `server/index.js` — register new endpoints

**Step 1:** Create endpoints:
- `GET /api/anthropic-oauth/start` — generates PKCE, starts callback server, returns authorize URL
- `GET /api/anthropic-oauth/status` — checks if callback received the code
- `POST /api/anthropic-oauth/exchange` — exchanges code for tokens
- `POST /api/anthropic-oauth/refresh` — refreshes expired token
- `GET /api/anthropic-oauth/logout` — clears stored tokens

**Step 2:** Store tokens in AnythingLLM's existing settings system (or a new `oauth_tokens.json`)

**Step 3:** Wire into `server/index.js`

**Step 4:** Commit
```bash
git commit -m "feat: Anthropic OAuth API endpoints"
```

---

## Task 5: Anthropic Provider — OAuth Token Support

**Files:**
- Modify: `server/utils/AiProviders/anthropic/index.js`

**Step 1:** Add OAuth token path alongside existing API key path

Currently the Anthropic provider reads `AnthropicApiKey` from settings. Add:
- Check for stored OAuth access token first
- If token exists and not expired, use it as the API key (Anthropic access tokens work as API keys)
- If expired, auto-refresh using stored refresh token
- Fall back to manual API key if no OAuth tokens

**Step 2:** Commit
```bash
git commit -m "feat: Anthropic provider supports OAuth tokens with auto-refresh"
```

---

## Task 6: Frontend — "Sign in with Claude" Button

**Files:**
- Modify onboarding flow (find the LLM selection page)
- Create: `frontend/src/components/AnthropicOAuth/` (login button + status)

**Step 1:** Add "Sign in with Claude Teams" button to the onboarding/LLM selection page

Flow:
1. User clicks "Sign in with Claude"
2. Frontend calls `GET /api/anthropic-oauth/start`
3. Backend returns authorize URL, opens in default browser
4. User authenticates on claude.ai
5. Callback server receives code
6. Frontend polls `GET /api/anthropic-oauth/status` or gets notified
7. Backend exchanges code for tokens
8. Frontend shows "✅ Connected as [user]"
9. Auto-selects Claude as LLM provider

**Step 2:** Add OAuth status indicator to settings page (connected/disconnected, token expiry)

**Step 3:** Commit
```bash
git commit -m "feat: 'Sign in with Claude' button in onboarding + settings"
```

---

## Task 7: Pre-configure MCP + Defaults

**Files:**
- Modify default config to include GZ reporting MCP server
- Set default workspace with agent enabled

**Step 1:** Add default MCP server config that gets written on first launch:
```json
{
  "mcpServers": {
    "gz-reporting": {
      "type": "stdio",
      "command": "uv",
      "args": ["run", "--directory", "${REPORTING_MCP_PATH}", "server.py"],
      "env": {
        "SNOWFLAKE_ACCOUNT": "WRA18224.us-east-1",
        "SNOWFLAKE_USER": "${SNOWFLAKE_USER}",
        "SNOWFLAKE_PRIVATE_KEY_PATH": "${SNOWFLAKE_KEY_PATH}"
      }
    }
  }
}
```

**Step 2:** Commit
```bash
git commit -m "feat: pre-configured GZ reporting MCP server on first launch"
```

---

## Task 8: Build + Test

**Step 1:** Build the frontend
```bash
cd frontend && yarn install && yarn build
```

**Step 2:** Build the Electron app (if desktop build exists)
```bash
# Check for electron builder config
```

**Step 3:** Test the full flow:
1. Launch app → see GrowthZone branding
2. Click "Sign in with Claude" → browser opens claude.ai
3. Authenticate → redirects back → "✅ Connected"
4. Ask "How many leads were created in January 2026?" → gets answer from MCP tools

**Step 4:** Commit
```bash
git commit -m "build: GrowthZone Intelligence v1.0.0 — branding + OAuth + MCP"
```

---

## Execution Order

```
Task 1 (branding assets)        → 10 min
Task 2 (rename app)             → 15 min
Task 3 (OAuth server-side)      → 30 min
Task 4 (OAuth endpoints)        → 20 min
Task 5 (provider OAuth support) → 15 min
Task 6 (frontend OAuth button)  → 30 min
Task 7 (MCP defaults)           → 10 min
Task 8 (build + test)           → 20 min
──────────────────────────────────────
Total:                           ~2.5 hours
```
