# OAuth Architecture — Sign in with Claude

GrowthZone Intelligence authenticates with the Anthropic API using OAuth instead of raw API keys. Users click "Sign in with Claude" and authorize via their Claude Teams, Pro, or Max subscription.

## Flow Overview

```
User clicks "Sign in with Claude"
    │
    ▼
Frontend calls GET /anthropic-oauth/start
    │
    ▼
Server generates PKCE verifier + challenge
Server starts local callback server on port 53692
Server returns authorize URL
    │
    ▼
Frontend opens authorize URL in user's default browser
    │
    ▼
User authenticates on claude.ai and authorizes the app
    │
    ▼
claude.ai redirects to http://localhost:53692/callback?code=...&state=...
    │
    ▼
Callback server receives the authorization code
Server exchanges code for access_token + refresh_token
Callback server shuts down (releases port 53692)
    │
    ▼
Tokens saved to server/storage/anthropic_oauth.json
Frontend polls GET /anthropic-oauth/status → authenticated: true
    │
    ▼
Access token used as Anthropic API key for all requests
```

## Client Registration

The OAuth flow uses Claude Code's registered OAuth client:

- **Client ID:** Shared with Claude Code / Pi (base64-encoded in source)
- **Authorization endpoint:** `https://claude.ai/oauth/authorize`
- **Token endpoint:** `https://platform.claude.com/v1/oauth/token`
- **Redirect URI:** `http://localhost:53692/callback`

## PKCE (Proof Key for Code Exchange)

Every OAuth flow generates a fresh PKCE pair:

- **Code verifier:** 128-character random string (A-Z, a-z, 0-9, `-._~`)
- **Code challenge:** SHA-256 hash of verifier, base64url-encoded
- **Method:** S256

The verifier is held in memory during the flow and sent with the token exchange. This prevents authorization code interception attacks.

## Required API Headers

After obtaining an access token, API requests to Anthropic must include:

| Header | Value | Purpose |
|--------|-------|---------|
| `Authorization` | `Bearer <access_token>` | Authentication |
| `anthropic-beta` | Beta feature flags | Required for OAuth tokens |
| `user-agent` | Claude Code user-agent string | API validation |
| `x-app` | Application identifier | API validation |

The system prompt must also include the Claude Code identity string — the Anthropic API validates this for OAuth-authenticated requests.

## Token Storage

Tokens are stored at:

```
server/storage/anthropic_oauth.json
```

Contents:

```json
{
  "access_token": "...",
  "refresh_token": "...",
  "expiresAt": 1711500000000
}
```

- File permissions are set to `0600` (owner read/write only)
- The file is **not committed** to version control (in `.gitignore`)

## Token Refresh

The `getValidAccessToken()` function handles the full token lifecycle:

1. Load tokens from disk
2. Check if `expiresAt` is in the past
3. If expired, call the token endpoint with `grant_type=refresh_token`
4. Save new tokens (new access_token, updated expiresAt)
5. Return the valid access token

This happens transparently on every API call — the user never sees token expiration.

## Port 53692

The local callback server runs on **port 53692**. This port is:

- Shared with Pi (the coding agent CLI) — both use the same Claude Code OAuth client
- **Released immediately** after receiving the callback — the HTTP server shuts down as soon as the authorization code is captured
- Only bound during the ~30 seconds of active OAuth flow

If port 53692 is in use (e.g., Pi is mid-OAuth), the flow will fail with a port conflict error. In practice this is rare since the port is held for seconds.

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/anthropic-oauth/start` | GET | Initiate OAuth flow, returns authorize URL |
| `/anthropic-oauth/status` | GET | Check authentication state (polling) |
| `/anthropic-oauth/refresh` | POST | Force token refresh |
| `/anthropic-oauth/logout` | POST | Clear stored tokens |

## Source Files

- `server/utils/AiProviders/anthropic/oauth.js` — PKCE generation, callback server, token exchange
- `server/utils/AiProviders/anthropic/tokenStorage.js` — File-based token persistence and refresh
- `server/utils/AiProviders/anthropic/pkce.js` — PKCE verifier/challenge generation
- `server/endpoints/anthropicOAuth.js` — Express route handlers

## Requirements

- **Claude Teams, Pro, or Max subscription** — Free accounts do not support OAuth
- **Port 53692 available** — Temporarily needed for the callback
- **Browser access** — User must be able to open claude.ai in a browser
