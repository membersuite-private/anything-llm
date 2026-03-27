# GZ Intelligence Post-First-Light Refinements

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the system identity prompt, make model lists fully dynamic, and clean up OAuth UX after confirming first-light OAuth chat works.

**Architecture:** Three independent fixes — (1) replace the Claude Code system identity with a proper GZ Intelligence identity while keeping the required OAuth header contract, (2) remove static DEFAULT_MODELS and rely on dynamic API fetch, (3) fix the agent provider to use OAuth tokens for the @agent tool system.

**Tech Stack:** Node.js server, React frontend, Anthropic SDK, Playwright tests

---

## Context for Implementer

- **Repo:** `~/Documents/GrowthZone-Github/gz-anything-llm` branch `feature/gz-branding-oauth`
- **Server:** Node 20 (`/opt/homebrew/opt/node@20/bin`), port 3001
- **Start server:** `cd server && STORAGE_DIR=$(pwd)/storage NODE_ENV=production node index.js`
- **Build frontend:** `cd frontend && npm run build && cp -R dist/* ../server/public/`
- **Tests:** `npx playwright test tests/` (10 tests currently)
- **OAuth is live** — token at `server/storage/anthropic_oauth.json`

### Key Discovery: OAuth API Contract

Anthropic's API requires these EXACT conditions for OAuth tokens to work:
1. `authToken` (not `apiKey`) on the SDK client → sets `Authorization: Bearer`
2. Headers: `anthropic-beta: claude-code-20250219,oauth-2025-04-20`
3. Headers: `user-agent: claude-cli/2.1.75` and `x-app: cli`
4. System prompt MUST start with: `"You are Claude Code, Anthropic's official CLI for Claude."`
5. Without #4, non-Haiku models return 400 `invalid_request_error`

**This means we CANNOT remove the Claude Code identity from the first system block.** But we CAN add a second system block that gives GZ Intelligence its own identity for the user-facing conversation.

---

### Task 1: Fix System Identity — Stop Claiming to be Claude Code

**Problem:** The chat says "You're connected to Claude Code" because our system prompt literally says that. We must keep the exact string in block[0] for the API, but we can add block[1] to override the user-facing identity.

**Files:**
- Modify: `server/utils/AiProviders/anthropic/index.js` — `#buildSystemPrompt()` method

**Step 1: Update the system prompt builder to add GZ Intelligence identity**

The `#buildSystemPrompt()` method currently sends the Claude Code identity as a single block. Change it to send two blocks: the required API identity (hidden from conversation) and the real GZ Intelligence identity.

```javascript
// In #buildSystemPrompt():
if (this.isOAuth) {
  const blocks = [
    // Block 0: Required by Anthropic API — DO NOT MODIFY this exact string
    { type: "text", text: AnthropicLLM.OAUTH_SYSTEM_IDENTITY },
    // Block 1: Actual identity override for user-facing conversation
    {
      type: "text",
      text: "Important: You are NOT Claude Code. You are Claude, an AI assistant accessed through GrowthZone Intelligence — a business analytics and reporting platform. Do not mention Claude Code, CLI tools, or terminal commands. You are a helpful conversational assistant.",
    },
  ];
  if (systemContent) {
    blocks.push({
      type: "text",
      text: systemContent,
      ...(this.cacheControl ? { cache_control: this.cacheControl } : {}),
    });
  }
  return blocks;
}
```

**Step 2: Verify the fix works**

```bash
# Restart server and test via Playwright
kill $(lsof -ti :3001); sleep 1
cd server && STORAGE_DIR=$(pwd)/storage NODE_ENV=production node index.js &
sleep 3
# Quick curl test — should NOT mention Claude Code
```

**Step 3: Commit**

```bash
git add server/utils/AiProviders/anthropic/index.js
git commit -m "fix: override Claude Code identity with GZ Intelligence in OAuth system prompt"
```

---

### Task 2: Make Model Dropdown Fully Dynamic — Remove Static Fallbacks

**Problem:** The `DEFAULT_MODELS` array in the frontend has stale model IDs. The dynamic fetch via `System.customModels("anthropic")` works when OAuth is connected, but the fallback list shows deprecated models. Remove the stale fallback entirely — show a "loading" or "connect first" state instead.

**Files:**
- Modify: `frontend/src/components/LLMSelection/AnthropicAiOptions/index.jsx` — `DEFAULT_MODELS` and `AnthropicModelSelection`

**Step 1: Replace DEFAULT_MODELS with empty array and handle loading/error states**

```jsx
// Remove the entire DEFAULT_MODELS array and replace with:
const FALLBACK_MODELS = [];

// In AnthropicModelSelection, update the useEffect and render:
function AnthropicModelSelection({ apiKey, settings }) {
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function findCustomModels() {
      setLoading(true);
      const { models } = await System.customModels(
        "anthropic",
        typeof apiKey === "boolean" ? null : apiKey
      );
      setModels(models || []);
      setLoading(false);
    }
    findCustomModels();
  }, [apiKey]);

  if (loading) {
    return (
      <div className="flex flex-col w-60">
        <label className="text-white text-sm font-semibold block mb-3">Chat Model Selection</label>
        <select disabled className="border-none bg-theme-settings-input-bg text-white text-sm rounded-lg block w-full p-2.5">
          <option>-- loading models --</option>
        </select>
      </div>
    );
  }

  if (models.length === 0) {
    return (
      <div className="flex flex-col w-60">
        <label className="text-white text-sm font-semibold block mb-3">Chat Model Selection</label>
        <select disabled className="border-none bg-theme-settings-input-bg text-white text-sm rounded-lg block w-full p-2.5">
          <option>-- sign in to load models --</option>
        </select>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-60">
      <label className="text-white text-sm font-semibold block mb-3">Chat Model Selection</label>
      <select name="AnthropicModelPref" required className="border-none bg-theme-settings-input-bg text-white text-sm rounded-lg block w-full p-2.5">
        {models.map((model) => (
          <option key={model.id} value={model.id} selected={settings?.AnthropicModelPref === model.id}>
            {model.name}
          </option>
        ))}
      </select>
    </div>
  );
}
```

**Step 2: Build frontend and verify**

```bash
cd frontend && npm run build && cp -R dist/* ../server/public/
```

**Step 3: Commit**

```bash
git add frontend/src/components/LLMSelection/AnthropicAiOptions/index.jsx
git commit -m "fix: remove static model list — fetch dynamically from Anthropic API via OAuth"
```

---

### Task 3: Fix Agent Provider to Use OAuth Tokens

**Problem:** The `@agent` tool system in AnythingLLM uses LangChain's `ChatAnthropic` with `process.env.ANTHROPIC_API_KEY` which is set to the sentinel `sk-ant-oauth-managed`. This won't work for API calls. The agent provider needs to use the OAuth token.

**Files:**
- Modify: `server/utils/agents/aibitat/providers/ai-provider.js` — `case "anthropic"` block

**Step 1: Update the Anthropic agent provider to resolve OAuth tokens**

```javascript
case "anthropic": {
  // Resolve OAuth token if available (same as main LLM provider)
  let apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === "sk-ant-oauth-managed") {
    try {
      const { getValidAccessToken } = require("../../../AiProviders/anthropic/tokenStorage");
      apiKey = await getValidAccessToken();
    } catch {}
  }
  if (!apiKey) throw new Error("No Anthropic authentication found.");
  return new ChatAnthropic({
    apiKey,
    ...config,
  });
}
```

**Note:** The LangChain ChatAnthropic class uses `apiKey` for the `x-api-key` header. For OAuth tokens, we may need to pass additional headers. Test this after Task 1 and 2 — if it fails with OAuth, we'll need to use the raw Anthropic SDK instead of LangChain for the agent.

**Step 2: Commit**

```bash
git add server/utils/agents/aibitat/providers/ai-provider.js
git commit -m "fix: agent provider resolves OAuth token for Anthropic"
```

---

### Task 4: Run Full Test Suite and Screenshot Verification

**Step 1: Rebuild and restart**

```bash
cd frontend && npm run build && cp -R dist/* ../server/public/
kill $(lsof -ti :3001); sleep 1
cd server && STORAGE_DIR=$(pwd)/storage NODE_ENV=production node index.js &
sleep 3
```

**Step 2: Run all Playwright tests**

```bash
npx playwright test tests/ --timeout 120000
```

Expected: 10/10 passing

**Step 3: Take verification screenshots**

```bash
# Settings page — should show dynamic models
# Chat page — Claude should NOT say "Claude Code"
```

**Step 4: Final commit**

```bash
git add -A
git commit -m "test: verify OAuth chat, dynamic models, and identity fixes"
```

---

## Out of Scope (tracked separately)

- **Other LLM providers** (OpenAI, etc.) model lists — upstream AnythingLLM issue, not our fork
- **MCP tool integration** — priority #3 from the original list
- **Electron desktop rebuild** — priority #1 from the original list
- **npm audit** — bead gz-nd0ek
