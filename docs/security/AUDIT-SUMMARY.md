# GZ Intelligence v1.0.0 — Security Audit Consolidated Report

**Date:** 2026-03-26
**Auditor:** security-auditor agent (Opus 4.6)
**Scope:** Full application — server, frontend, desktop, OAuth, MCP, dependencies
**Methodology:** OWASP Top 10, ASVS v4.0, CWE/SANS Top 25, STRIDE

---

## Executive Summary

| Severity | Count | Our Code | Upstream |
|----------|-------|----------|----------|
| 🔴 CRITICAL | 10 | 3 | 7 |
| 🟠 HIGH | 16 | 4 | 12 |
| 🟡 MEDIUM | 16 | 3 | 13 |
| 🔵 LOW | 9 | 1 | 8 |
| ⚪ INFO | 2 | 0 | 2 |
| **TOTAL** | **53** | **11** | **44** |

**Plus 117 npm CVEs** (22 critical, 44 high, 41 moderate, 10 low) across server/frontend/desktop.

**Bottom line:** ~80% of findings are inherited from upstream AnythingLLM. Our 11 findings are concentrated in the OAuth flow and can be addressed quickly. The upstream issues are real but most require an attacker to already have admin access.

---

## 🔴 CRITICAL Findings (10)

### OUR CODE (3)

| # | Finding | File | Fix Effort |
|---|---------|------|-----------|
| F1 | **OAuth endpoints unauthenticated** — anyone on the network can start/cancel OAuth flows, logout users | `endpoints/anthropicOAuth.js` | Add `validatedRequest` middleware |
| F2 | **PKCE verifier reused as OAuth state** — CSRF protection collapsed, state should be a separate random value | `oauth.js` | Generate independent state param |
| F2b | **OAuth endpoints unauthenticated** (also flagged in Part 3) | Same as F1 | Same fix |

### UPSTREAM (7)

| # | Finding | File | Fix Effort |
|---|---------|------|-----------|
| U1 | **SQL Agent executes LLM-generated SQL** — no guardrails, agent can DROP tables | `agents/aibitat/plugins/sql-agent/` | Add SQL statement whitelist (SELECT only) |
| U2 | **`sf_query` MCP tool runs arbitrary Snowflake SQL** — prompt injection → data exfil | MCP gz-reporting server | Add read-only enforcement in MCP server |
| U3 | **MCP servers execute as unsandboxed child processes** — malicious config = RCE | `MCP/hypervisor/index.js` | Sandbox MCP processes |
| U4 | **Convict prototype pollution** (CVE) — config loading | `node_modules/convict` | `npm audit fix` |
| U5 | **3GB body parser limit** — trivial memory exhaustion DoS | `server/index.js` | Reduce to 10MB |
| U6 | **MCP server spawns arbitrary processes from JSON config** — admin writes config, server execs it | `MCP/hypervisor/` | Validate command against allowlist |
| U7 | **LLM-directed SQL injection via SQL Agent** (duplicate of U1 from different scan angle) | Same | Same |

---

## 🟠 HIGH Findings (16)

### OUR CODE (4)

| # | Finding | Fix |
|---|---------|-----|
| H1 | **OAuth Client ID "hidden" via Base64** — trivially decoded, false security | Remove obfuscation, it's a public client ID |
| H2 | **OAuth token stored as plaintext JSON** — `anthropic_oauth.json` readable | Encrypt at rest via EncryptionManager |
| H3 | **`.env` with weak secrets in working tree** — JWT_SECRET='my-random-string' | Generate strong random secrets on first run |
| H4 | **Token exchange errors leak response bodies** — internal error details in logs | Sanitize error messages |

### UPSTREAM (12)

| # | Finding | Category |
|---|---------|----------|
| H5 | Chart/Markdown rendering without DOMPurify | XSS |
| H6 | Markdown `html: true` bypasses XSS protection | XSS |
| H7 | i18n strings via dangerouslySetInnerHTML | XSS |
| H8 | Agent Flow API Call Executor — full SSRF | SSRF |
| H9 | Prompt injection via document content → agent tool abuse | LLM |
| H10 | System prompt extraction via user queries | LLM |
| H11 | Full environment variable leakage to MCP servers | MCP |
| H12 | @langchain/core serialization injection (CVE) | Deps |
| H13 | Multer DoS via resource exhaustion (CVE) | Deps |
| H14 | @modelcontextprotocol/sdk cross-client data leak + ReDoS | Deps |
| H15 | No file size limit on Multer uploads | DoS |
| H16 | Single-user mode auth bypass (by design, but risky) | Access |

---

## 🟡 MEDIUM Findings (16)

| # | Finding | Source |
|---|---------|--------|
| M1 | No rate limiting on any API endpoint | Upstream |
| M2 | No security headers (CSP, HSTS, X-Frame-Options) | Upstream |
| M3 | CORS wildcard `origin: true` accepts all origins | Upstream |
| M4 | PGVector table name from env var in SQL templates | Upstream |
| M5 | Collector URL validation allows localhost/loopback | Upstream |
| M6 | No Content-Security-Policy headers | Upstream |
| M7 | File upload preserves original filename | Upstream |
| M8 | Agent Flow file operations without isWithin check | Upstream |
| M9 | No tool call rate limiting — token budget exhaustion | Upstream |
| M10 | MCP tool results injected directly into conversation | Upstream |
| M11 | MCP config JSON writable without validation | Upstream |
| M12 | No MCP server process resource limits | Upstream |
| M13 | Axios SSRF and DoS vulnerabilities (CVE) | Upstream |
| M14 | No WebSocket connection limits | Upstream |
| M15 | No API rate limiting (duplicate) | Upstream |
| M16 | Workspace thread isolation gap in multi-user mode | Upstream |

---

## Recommended Fix Priority

### Immediate (before any non-dev deployment)

1. **Add auth to OAuth endpoints** [OUR CODE] — `validatedRequest` middleware on all `/anthropic-oauth/*` routes
2. **Fix PKCE state parameter** [OUR CODE] — generate separate state value, don't reuse verifier
3. **Encrypt OAuth tokens at rest** [OUR CODE] — use AnythingLLM's existing EncryptionManager
4. **Reduce body parser limit** [UPSTREAM] — 3GB → 10MB
5. **Run `npm audit fix`** — fixes most @aws-sdk criticals and convict prototype pollution

### Next Release

6. **SQL Agent guardrails** — SELECT-only whitelist for LLM-generated SQL
7. **Rate limiting** — express-rate-limit on all API endpoints
8. **Security headers** — helmet.js middleware
9. **CORS tightening** — restrict to known origins
10. **MCP process sandboxing** — resource limits, env var filtering

### Backlog

11. XSS hardening (DOMPurify for markdown, remove dangerouslySetInnerHTML)
12. File upload limits and validation
13. LangChain upgrade (major version, breaking changes)
14. WebSocket connection limits

---

## Detailed Reports

- [Part 1: Auth, OAuth, Secrets, Electron](audit-part1-auth.md) — 11 findings
- [Part 2: Injection, XSS, SSRF, File, Data](audit-part2-injection.md) — 15 findings  
- [Part 3: LLM, MCP, Dependencies, DoS, Access](audit-part3-llm-deps.md) — 27 findings

---

## Answer: Did We Break 1,000?

**53 code-level findings + 117 npm CVEs = 170 total issues.**

Not 1,000 — but 10 criticals is nothing to sneeze at. The good news: only 3 criticals are ours, and they're all fixable in a few hours. The upstream AnythingLLM project carries the bulk of the security debt.
