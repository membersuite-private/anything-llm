# GrowthZone Intelligence — Desktop App

Electron wrapper that bundles the GrowthZone Intelligence server and web UI into a native desktop application.

## How It Works

The Electron app:

1. **Starts the Node.js server** internally (same as `cd server && node index.js`)
2. **Waits for the server** to respond on port 3001 (polls `/api/ping`, 30s timeout)
3. **Opens a BrowserWindow** pointed at `http://localhost:3001`
4. **Handles lifecycle** — kills the server process on quit, opens external links in the default browser

The user sees a single native window with the full GrowthZone Intelligence UI. No terminal, no browser tab.

## App Identity

- **App Name:** GrowthZone Intelligence
- **App ID:** `com.growthzone.intelligence`
- **Window:** 1400×900, dark background (`#1a1a2e`)

## Building

### Prerequisites

- Node.js 20
- `npm install` in both `server/` and `desktop/`
- Frontend must be built first: `cd frontend && npm run build && cp -R dist/* ../server/public/`

### macOS

```bash
cd desktop
npm run build:mac
```

Produces a `.dmg` and `.zip` in `desktop/dist/`.

### Windows

```bash
cd desktop
npm run build:win
```

Produces an NSIS installer in `desktop/dist/`.

### Linux

```bash
cd desktop
npm run build:linux
```

Produces an AppImage and `.deb` in `desktop/dist/`.

### All Platforms

```bash
cd desktop
npm run build:all
```

## Development

Run the Electron app without packaging:

```bash
cd desktop
npm start
```

This starts Electron directly, which spawns the server and opens the window. Useful for debugging the desktop wrapper itself.

## Configuration

The server inherits its configuration from environment variables and the `server/storage/` directory. The Electron wrapper sets:

- `NODE_ENV=production`
- `STORAGE_DIR=<server>/storage`
- `SERVER_PORT=3001`

OAuth tokens, MCP server configs, and all user data live in `server/storage/`.
