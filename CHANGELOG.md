# Changelog

All notable changes to GrowthZone Intelligence are documented here.

## [v1.0.3] - 2026-03-27

### Fixed
- Tool call limit raised from 10 → 50 (configurable via AGENT_MAX_TOOL_CALLS env var)
- Agent WebSocket timeout increased from 5min → 10min for complex tool chains
- Content width toggle renamed: Compact / Auto / Wide / Full with viewport-relative units (vw)
- Responsive table CSS for wide markdown tables
- Artifact rendering — SVG/HTML from Claude rendered in sandboxed iframes (both streaming and history)
- Artifact iframe uses dark background, SVG fills width without white gutters
- Agent session WebSocket properly closes after completion (was hanging open forever)
- Stop button shows during agent sessions, disappears when done (uses agentSessionActive state)
- React render lifecycle fix for artifact detection (useRef → message prop)

## [v1.0.2] - 2026-03-27

### Security
- Body parser limit reduced from 3GB to 10MB (trivial DoS prevention)
- Helmet.js security headers added (X-Frame-Options, X-Content-Type-Options, etc.)
- Rate limiting added — 300 req/15min per IP via express-rate-limit
- CORS restricted from wildcard to explicit localhost origins
- Multer file upload size limit set to 100MB
- SQL Agent guardrails — SELECT-only whitelist blocks DDL/DML
- Markdown XSS — disabled raw HTML in markdown-it renderer
- Agent Flow SSRF — URL validation blocks localhost, private IPs, cloud metadata
- MCP environment variable filtering — only declared vars passed to child processes
- MCP command validation — blocks shell metacharacters, requires known runtimes
- LLM security guardrails — prompt injection resistance, tool safety, input boundaries
- npm audit — eliminated all critical CVEs, reduced total from 117 to 40
- LangChain upgraded to v1.x (serialization injection CVE fixed)
- AWS SDK chain updated (xml-parser CVE fixed)

## [v1.0.1] - 2026-03-27

### Fixed
- OAuth token cache invalidation — tokens refresh properly after sleep/expiry
- Agent tool_use/tool_result message pairing — multi-step MCP tool calls no longer crash
- Content width toggle added (Auto/Medium/Full)

### Security
- OAuth endpoints require authentication (was zero auth)
- PKCE state parameter separated from verifier (CSRF protection restored)
- OAuth tokens encrypted at rest via EncryptionManager

## [v1.0.0] - 2026-03-26

### Added
- **Sign in with Claude** — OAuth PKCE flow for Claude Teams/Pro/Max (no API key needed)
- **Dynamic model selection** — fetches live models from Anthropic API (Sonnet 4.6, Opus 4.6, etc.)
- **39 MCP reporting tools** — membership, revenue, events, GTM, Gong analytics via Snowflake
- **GrowthZone branding** — logos, app name, favicon, locale throughout
- **Electron desktop app** — GrowthZone Intelligence.app (macOS ARM64, 94MB DMG)
- **10 Playwright tests** — branding, OAuth, dynamic models, E2E chat
- **MCP tools visible in chat** — Tools menu shows connected MCP servers and tool count
- **GZ Intelligence system prompt** — data expert identity for business analytics
- **Automatic chat mode** — Claude uses tools when relevant, no @agent prefix needed
- **Comprehensive security audit** — 53 findings documented across 3 reports

### Architecture
- Fork of AnythingLLM (MIT license) by Mintplex Labs
- Anthropic OAuth uses Claude Code client registration (required identity headers)
- OAuth callback on port 53692 releases immediately after token exchange
- OAuth tokens stored encrypted, auto-refresh on expiry
