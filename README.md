# GrowthZone Intelligence

AI-powered business intelligence for association management. Ask questions about your membership, revenue, events, and operations — get answers backed by real data from your GrowthZone platform.

GrowthZone Intelligence is a desktop AI client that connects to Claude (Anthropic) via OAuth and uses 39 MCP reporting tools to query your Snowflake data warehouse. It runs as a native macOS/Windows/Linux app or as a local web server.

## Key Features

- **Sign in with Claude** — OAuth login using your Claude Teams, Pro, or Max subscription. No API keys to manage.
- **Dynamic Model Selection** — Switch between Claude Sonnet 4.6, Opus 4.6, and other models on the fly.
- **39 MCP Reporting Tools** — Membership, revenue, invoicing, events, payments, financials, Gong call analytics, and GTM pipeline tools — all powered by Snowflake.
- **GrowthZone Branding** — Custom UI with GrowthZone colors, logo, and identity throughout.
- **Desktop App** — Native Electron wrapper that bundles the server and UI into a single application.
- **Multi-user Workspaces** — Inherited from AnythingLLM: workspaces, document embedding, conversation history.

## Quick Start

### Prerequisites

- **Node.js 20** (required — not Node 22+)
  - macOS (Homebrew): `/opt/homebrew/opt/node@20/bin`
- **Claude Teams, Pro, or Max subscription** for OAuth authentication

### Run the Server

```bash
cd server
npm install
STORAGE_DIR=$(pwd)/storage NODE_ENV=production node index.js
```

The server starts on **http://localhost:3001**.

### Build the Frontend

```bash
cd frontend
npm install
npm run build
cp -R dist/* ../server/public/
```

Then open http://localhost:3001 in your browser.

### Build the Desktop App

```bash
cd desktop
npm install
npm run build:mac
```

See [desktop/README.md](desktop/README.md) for platform-specific build instructions.

## OAuth Setup

GrowthZone Intelligence uses **"Sign in with Claude"** instead of raw API keys:

1. Launch the app and click **Sign in with Claude**
2. Your browser opens to claude.ai for authentication
3. Authorize the app to use your Claude subscription
4. The app receives OAuth tokens automatically via a local callback
5. Tokens are stored locally and refresh automatically

**Requirements:** A Claude Teams, Pro, or Max subscription. The OAuth flow uses PKCE with a local callback server on port 53692.

See [docs/OAUTH.md](docs/OAUTH.md) for the full technical architecture.

## MCP Reporting Tools

The 39 built-in tools connect to your Snowflake data warehouse and cover:

| Category | Tools | Examples |
|----------|-------|---------|
| Membership | 7 | Member roster, churn analysis, join/drop history |
| Revenue & Invoicing | 3 | Revenue by period, invoice detail, AR aging |
| Events | 1 | Event listing with attendance |
| Payments | 1 | Payment detail by type and gateway |
| Financial | 1 | GL account rollup by month |
| Gong Analytics | 5 | Call recordings, deal tracking, conversation intelligence |
| GTM Pipeline | 16 | Pipeline stages, deal flow, forecasting |
| Utility | 5 | Report catalog, KPI dashboards, active snapshots |

Tools are configured via MCP server definitions and appear in the Agent Skills page and the Tools menu in chat.

See [docs/MCP.md](docs/MCP.md) for configuration and tool details.

## Architecture

GrowthZone Intelligence is a fork of [AnythingLLM](https://github.com/Mintplex-Labs/anything-llm) (MIT license) with these additions:

- **Anthropic OAuth provider** — PKCE-based "Sign in with Claude" flow (`server/utils/AiProviders/anthropic/oauth.js`)
- **Token storage & refresh** — Automatic token lifecycle management (`server/utils/AiProviders/anthropic/tokenStorage.js`)
- **OAuth API endpoints** — Start, status, refresh, logout (`server/endpoints/anthropicOAuth.js`)
- **Dynamic model selection** — Runtime model switching for Claude Sonnet/Opus
- **MCP tool integration** — 39 reporting tools via Snowflake MCP servers
- **GrowthZone branding** — Custom colors, logos, and UI text throughout frontend
- **Electron desktop wrapper** — Native app packaging (`desktop/`)

The upstream AnythingLLM features (workspaces, document embedding, vector stores, multi-user support) are preserved.

## Development

### Running Tests

There are 10 Playwright end-to-end tests covering OAuth flow, chat functionality, and UI branding:

```bash
npx playwright test tests/
```

Test files:
- `tests/gz-intel.spec.ts` — OAuth, branding, model selection
- `tests/gz-chat-e2e.spec.ts` — Chat interactions, tool usage

### Branch Structure

- `feature/gz-branding-oauth` — Main development branch with all GZ customizations
- `main` — Upstream AnythingLLM (kept in sync for merges)

### Project Layout

```
gz-anything-llm/
├── server/           # Node.js backend (Express, port 3001)
├── frontend/         # React frontend (Vite, builds to server/public/)
├── desktop/          # Electron wrapper
├── tests/            # Playwright E2E tests
└── docs/             # Documentation
    ├── OAUTH.md      # OAuth architecture
    ├── MCP.md        # MCP tool integration
    └── RELEASE.md    # Release instructions
```

## License

MIT — same as the upstream project.

## Credits

Built on [AnythingLLM](https://github.com/Mintplex-Labs/anything-llm) by [Mintplex Labs](https://github.com/Mintplex-Labs). AnythingLLM is an open-source AI application with 54K+ GitHub stars, providing the workspace, document embedding, and multi-user foundation that GrowthZone Intelligence extends.
