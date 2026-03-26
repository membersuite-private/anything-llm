import { useState, useEffect } from "react";
import System from "@/models/system";
import { CaretDown, CaretUp } from "@phosphor-icons/react";

export default function AnthropicAiOptions({ settings }) {
  const [showAdvancedControls, setShowAdvancedControls] = useState(false);
  const [showApiKeySection, setShowApiKeySection] = useState(false);
  const [inputValue, setInputValue] = useState(settings?.AnthropicApiKey);
  const [anthropicApiKey, setAnthropicApiKey] = useState(
    settings?.AnthropicApiKey
  );
  const [oauthStatus, setOauthStatus] = useState("checking");

  // Check OAuth status on mount
  useEffect(() => {
    async function checkOAuth() {
      try {
        const res = await fetch("/api/anthropic-oauth/status");
        const data = await res.json();
        setOauthStatus(data.authenticated ? "connected" : "disconnected");
      } catch {
        setOauthStatus("disconnected");
      }
    }
    checkOAuth();
  }, []);

  // Poll while pending
  useEffect(() => {
    if (oauthStatus !== "pending") return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/anthropic-oauth/status");
        const data = await res.json();
        if (data.authenticated) {
          setOauthStatus("connected");
          clearInterval(interval);
        }
      } catch {}
    }, 2000);
    return () => clearInterval(interval);
  }, [oauthStatus]);

  async function handleOAuthLogin() {
    try {
      const res = await fetch("/api/anthropic-oauth/start");
      const data = await res.json();
      if (data.success && data.authorizeUrl) {
        window.open(data.authorizeUrl, "_blank");
        setOauthStatus("pending");
      } else if (data.error) {
        alert(data.error);
      }
    } catch (err) {
      console.error("OAuth start failed:", err);
    }
  }

  async function handleOAuthLogout() {
    try {
      await fetch("/api/anthropic-oauth/logout", { method: "POST" });
      setOauthStatus("disconnected");
    } catch (err) {
      console.error("OAuth logout failed:", err);
    }
  }

  return (
    <div className="w-full flex flex-col">
      {/* OAuth Section */}
      <div className="w-full mb-4 p-4 rounded-lg bg-theme-settings-input-bg border border-theme-sidebar-border">
        {oauthStatus === "connected" ? (
          <>
            {/* Connected state — show status + model selector together */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
                <span className="text-green-400 text-sm font-semibold">
                  Connected via Claude Teams
                </span>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleOAuthLogout();
                }}
                className="text-xs text-red-400 hover:text-red-300 underline"
              >
                Disconnect
              </button>
            </div>

            {/* Model selection — inside the OAuth card when connected */}
            <div className="flex items-center gap-[36px]">
              <AnthropicModelSelection
                apiKey={true}
                settings={settings}
              />
            </div>
          </>
        ) : oauthStatus === "pending" ? (
          <div className="flex flex-col gap-2">
            <p className="text-theme-text-secondary text-xs">
              Waiting for authentication — complete the login in your browser...
            </p>
            <button
              type="button"
              disabled={true}
              className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[#D4A574] text-white font-semibold text-sm opacity-50 cursor-wait"
            >
              <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span>
              Waiting for authentication...
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-theme-text-secondary text-xs">
              Sign in with your Claude Teams account — no API key needed.
            </p>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleOAuthLogin();
              }}
              className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[#D4A574] hover:bg-[#C49464] text-white font-semibold text-sm transition-colors"
            >
              Sign in with Claude
            </button>
          </div>
        )}
      </div>

      {/* Hidden sentinel for form submission when OAuth is active */}
      {oauthStatus === "connected" && (
        <input type="hidden" name="AnthropicApiKey" value="sk-ant-oauth-managed" />
      )}

      {/* API Key fallback — collapsed by default when OAuth is connected */}
      {oauthStatus === "connected" ? (
        <div className="mb-2">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              setShowApiKeySection(!showApiKeySection);
            }}
            className="text-theme-text-secondary hover:text-theme-text-primary text-xs flex items-center gap-1"
          >
            {showApiKeySection ? "Hide" : "Use"} API key instead
            {showApiKeySection ? (
              <CaretUp size={12} />
            ) : (
              <CaretDown size={12} />
            )}
          </button>
        </div>
      ) : (
        <>
          {/* Divider — only show when not connected */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-theme-sidebar-border"></div>
            <span className="text-theme-text-secondary text-xs">
              or use an API key
            </span>
            <div className="flex-1 h-px bg-theme-sidebar-border"></div>
          </div>
        </>
      )}

      {/* API Key + Model Selection (when not OAuth connected, or when expanded) */}
      <div
        hidden={oauthStatus === "connected" && !showApiKeySection}
      >
        <div className="w-full flex items-center gap-[36px] mt-1.5">
          <div className="flex flex-col w-60">
            <label className="text-white text-sm font-semibold block mb-3">
              Anthropic API Key
            </label>
            <input
              type="password"
              name="AnthropicApiKey"
              className="border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5"
              placeholder="Anthropic Claude-2 API Key"
              defaultValue={
                settings?.AnthropicApiKey ? "*".repeat(20) : ""
              }
              required={oauthStatus !== "connected"}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setInputValue(e.target.value)}
              onBlur={() => setAnthropicApiKey(inputValue)}
            />
          </div>
          {oauthStatus !== "connected" && !settings?.credentialsOnly && (
            <AnthropicModelSelection
              apiKey={anthropicApiKey}
              settings={settings}
            />
          )}
        </div>
      </div>

      {/* Advanced settings */}
      <div className="flex justify-start mt-4">
        <button
          onClick={(e) => {
            e.preventDefault();
            setShowAdvancedControls(!showAdvancedControls);
          }}
          className="border-none text-theme-text-primary hover:text-theme-text-secondary flex items-center text-sm"
        >
          {showAdvancedControls ? "Hide" : "Show"} advanced settings
          {showAdvancedControls ? (
            <CaretUp size={14} className="ml-1" />
          ) : (
            <CaretDown size={14} className="ml-1" />
          )}
        </button>
      </div>
      <div hidden={!showAdvancedControls}>
        <div className="w-full flex items-start gap-4 mt-1.5">
          <div className="flex flex-col w-60">
            <div className="flex justify-between items-center mb-2">
              <label className="text-white text-sm font-semibold">
                Prompt Caching
              </label>
            </div>
            <select
              name="AnthropicCacheControl"
              className="border-none bg-theme-settings-input-bg border-gray-500 text-white text-sm rounded-lg block w-full p-2.5"
            >
              <option
                value="none"
                selected={settings?.AnthropicCacheControl === "none"}
              >
                No caching
              </option>
              <option
                value="5m"
                selected={settings?.AnthropicCacheControl === "5m"}
              >
                5 minutes
              </option>
              <option
                value="1h"
                selected={settings?.AnthropicCacheControl === "1h"}
              >
                1 hour
              </option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}

const DEFAULT_MODELS = [
  {
    id: "claude-3-7-sonnet-20250219",
    name: "Claude 3.7 Sonnet",
  },
  {
    id: "claude-3-5-sonnet-20241022",
    name: "Claude 3.5 Sonnet (New)",
  },
  {
    id: "claude-3-5-haiku-20241022",
    name: "Claude 3.5 Haiku",
  },
  {
    id: "claude-3-5-sonnet-20240620",
    name: "Claude 3.5 Sonnet (Old)",
  },
  {
    id: "claude-3-haiku-20240307",
    name: "Claude 3 Haiku",
  },
  {
    id: "claude-3-opus-20240229",
    name: "Claude 3 Opus",
  },
  {
    id: "claude-3-sonnet-20240229",
    name: "Claude 3 Sonnet",
  },
  {
    id: "claude-2.1",
    name: "Claude 2.1",
  },
  {
    id: "claude-2.0",
    name: "Claude 2.0",
  },
];

function AnthropicModelSelection({ apiKey, settings }) {
  const [models, setModels] = useState(DEFAULT_MODELS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function findCustomModels() {
      setLoading(true);
      const { models } = await System.customModels(
        "anthropic",
        typeof apiKey === "boolean" ? null : apiKey
      );
      if (models.length > 0) setModels(models);
      setLoading(false);
    }
    findCustomModels();
  }, [apiKey]);

  if (loading) {
    return (
      <div className="flex flex-col w-60">
        <label className="text-white text-sm font-semibold block mb-3">
          Chat Model Selection
        </label>
        <select
          name="AnthropicModelPref"
          disabled={true}
          className="border-none bg-theme-settings-input-bg border-gray-500 text-white text-sm rounded-lg block w-full p-2.5"
        >
          <option disabled={true} selected={true}>
            -- loading available models --
          </option>
        </select>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-60">
      <label className="text-white text-sm font-semibold block mb-3">
        Chat Model Selection
      </label>
      <select
        name="AnthropicModelPref"
        required={true}
        className="border-none bg-theme-settings-input-bg border-gray-500 text-white text-sm rounded-lg block w-full p-2.5"
      >
        {models.map((model) => (
          <option
            key={model.id}
            value={model.id}
            selected={settings?.AnthropicModelPref === model.id}
          >
            {model.name}
          </option>
        ))}
      </select>
    </div>
  );
}
