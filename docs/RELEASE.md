# Release Instructions

## Version Numbering

- **v1.0.0** — First release of GrowthZone Intelligence
- Follow semver: major.minor.patch
- Increment minor for new features, patch for fixes

## Creating a Release

### 1. Prepare the Branch

Ensure `feature/gz-branding-oauth` is clean and all tests pass:

```bash
git checkout feature/gz-branding-oauth
git pull
npx playwright test tests/
```

### 2. Build the Frontend

```bash
cd frontend
npm install
npm run build
cp -R dist/* ../server/public/
```

### 3. Build Desktop Artifacts

```bash
cd desktop
npm install
npm run build:mac
```

Artifacts are in `desktop/dist/`:
- `GrowthZone Intelligence-1.0.0.dmg` — macOS disk image
- `GrowthZone Intelligence-1.0.0-mac.zip` — macOS zip archive

### 4. Tag the Release

```bash
git tag -a v1.0.0 -m "GrowthZone Intelligence v1.0.0"
git push origin v1.0.0
```

### 5. Create GitHub Release

1. Go to the repository's Releases page
2. Click **Draft a new release**
3. Select the `v1.0.0` tag
4. Title: `GrowthZone Intelligence v1.0.0`
5. Paste the release notes (see template below)
6. Upload artifacts:
   - `GrowthZone Intelligence-1.0.0.dmg`
   - `GrowthZone Intelligence-1.0.0-mac.zip`
7. Publish

## Release Notes Template

```markdown
# GrowthZone Intelligence v1.0.0

AI-powered business intelligence for association management, built on AnythingLLM.

## Features

- **Sign in with Claude** — OAuth authentication with Claude Teams/Pro/Max subscriptions (PKCE flow)
- **Dynamic Model Selection** — Switch between Claude Sonnet 4.6, Opus 4.6, and other models at runtime
- **39 MCP Reporting Tools** — Membership, revenue, events, payments, financials, Gong analytics, and GTM pipeline tools via Snowflake
- **GrowthZone Branding** — Custom UI with GrowthZone colors, logo, and identity
- **Desktop App** — Native Electron wrapper for macOS (Windows/Linux coming soon)
- **10 E2E Tests** — Playwright test suite covering OAuth, chat, and branding

## Requirements

- Claude Teams, Pro, or Max subscription
- Node.js 20 (for development/server mode)
- macOS 12+ (for desktop app)

## Installation

Download the `.dmg` file, open it, and drag GrowthZone Intelligence to your Applications folder.

## Credits

Built on [AnythingLLM](https://github.com/Mintplex-Labs/anything-llm) by Mintplex Labs (MIT license).
```

## Future Releases

- Add Windows NSIS installer (`npm run build:win`)
- Add Linux AppImage/deb (`npm run build:linux`)
- Consider auto-update via `electron-updater` for subsequent versions
