const { v4 } = require("uuid");
const {
  writeResponseChunk,
  clientAbortedHandler,
  formatChatHistory,
} = require("../../helpers/chat/responses");
const { NativeEmbedder } = require("../../EmbeddingEngines/native");
const { MODEL_MAP } = require("../modelMap");
const {
  LLMPerformanceMonitor,
} = require("../../helpers/chat/LLMPerformanceMonitor");
const { getAnythingLLMUserAgent } = require("../../../endpoints/utils");
const { getValidAccessToken } = require("./tokenStorage");

class AnthropicLLM {
  constructor(embedder = null, modelPreference = null) {
    this.className = "AnthropicLLM";
    this.anthropic = null; // Lazy initialization
    this._apiKey = null; // Cache the resolved API key
    this.model =
      modelPreference ||
      process.env.ANTHROPIC_MODEL_PREF ||
      "claude-3-5-sonnet-20241022";
    this.limits = {
      history: this.promptWindowLimit() * 0.15,
      system: this.promptWindowLimit() * 0.15,
      user: this.promptWindowLimit() * 0.7,
    };

    this.maxTokens = null;
    this.embedder = embedder ?? new NativeEmbedder();
    this.defaultTemp = 0.7;
    this.log(
      `Initialized with ${this.model}. Cache ${this.cacheControl ? `enabled (${this.cacheControl.ttl})` : "disabled"}`
    );

    AnthropicLLM.fetchModelMaxTokens(this.model).then((maxTokens) => {
      this.maxTokens = maxTokens;
      this.log(`Model ${this.model} max tokens: ${this.maxTokens}`);
    });
  }

  /**
   * Get API key with OAuth token priority over manual API key
   * @returns {Promise<string>} The API key to use
   */
  async #getApiKey() {
    if (this._apiKey) return this._apiKey;

    // 1. Check for OAuth token first (from "Sign in with Claude")
    const oauthToken = await getValidAccessToken();
    if (oauthToken) {
      this._apiKey = oauthToken;
      return oauthToken;
    }
    
    // 2. Fall back to manual API key from environment
    const manualKey = process.env.ANTHROPIC_API_KEY;
    if (!manualKey || manualKey === "sk-ant-oauth-managed") {
      throw new Error(
        "No Anthropic authentication found. Please go to Settings > AI Providers > LLM and either click 'Sign in with Claude' or enter an API key."
      );
    }
    
    this._apiKey = manualKey;
    return manualKey;
  }

  /**
   * Get or create the Anthropic client with lazy initialization
   * @returns {Promise<import("@anthropic-ai/sdk").Anthropic>}
   */
  async #getClient() {
    if (this.anthropic) return this.anthropic;

    const apiKey = await this.#getApiKey();
    const AnthropicAI = require("@anthropic-ai/sdk");
    this.anthropic = new AnthropicAI({
      apiKey: apiKey,
      defaultHeaders: {
        "User-Agent": getAnythingLLMUserAgent(),
      },
    });

    return this.anthropic;
  }

  log(text, ...args) {
    console.log(`\x1b[36m[${this.className}]\x1b[0m ${text}`, ...args);
  }

  streamingEnabled() {
    return "streamGetChatCompletion" in this;
  }

  static promptWindowLimit(modelName) {
    return MODEL_MAP.get("anthropic", modelName) ?? 100_000;
  }

  promptWindowLimit() {
    return MODEL_MAP.get("anthropic", this.model) ?? 100_000;
  }

  isValidChatCompletionModel(_modelName = "") {
    return true;
  }

  async assertModelMaxTokens() {
    if (this.maxTokens) return this.maxTokens;
    this.maxTokens = await AnthropicLLM.fetchModelMaxTokens(this.model);
    return this.maxTokens;
  }

  /**
   * Get API key with OAuth token priority (static version)
   * @returns {Promise<string>} The API key to use
   */
  static async #getStaticApiKey() {
    // 1. Check for OAuth token first (from "Sign in with Claude")
    const oauthToken = await getValidAccessToken();
    if (oauthToken) return oauthToken;
    
    // 2. Fall back to manual API key from environment
    const manualKey = process.env.ANTHROPIC_API_KEY;
    if (!manualKey) {
      throw new Error(
        "No Anthropic authentication found. Please sign in with Claude or enter an API key in Settings."
      );
    }
    
    return manualKey;
  }

  /**
   * Fetches the maximum number of tokens the model should generate in its response.
   * This varies per model but will fallback to 4096 if the model is not found.
   * @param {string} modelName - The name of the model to fetch the max tokens for
   * @returns {Promise<number>} The maximum output tokens limit for API calls.
   */
  static async fetchModelMaxTokens(
    modelName = process.env.ANTHROPIC_MODEL_PREF
  ) {
    try {
      const apiKey = await AnthropicLLM.#getStaticApiKey();
      const AnthropicAI = require("@anthropic-ai/sdk");
      /** @type {import("@anthropic-ai/sdk").Anthropic} */
      const anthropic = new AnthropicAI({
        apiKey: apiKey,
      });
      const model = await anthropic.models.retrieve(modelName);
      return Number(model.max_tokens ?? 4096);
    } catch (error) {
      console.error(`Error fetching model max tokens for ${modelName}:`, error);
      return 4096;
    }
  }

  /**
   * Parses the cache control ENV variable
   *
   * If caching is enabled, we can pass less than 1024 tokens and Anthropic will just
   * ignore it unless it is above the model's minimum. Since this feature is opt-in
   * we can safely assume that if caching is enabled that we should just pass the content as is.
   * https://docs.claude.com/en/docs/build-with-claude/prompt-caching#cache-limitations
   *
   * @param {string} value - The ENV value (5m or 1h)
   * @returns {null|{type: "ephemeral", ttl: "5m" | "1h"}} Cache control configuration
   */
  get cacheControl() {
    // Store result in instance variable to avoid recalculating
    if (this._cacheControl) return this._cacheControl;

    if (!process.env.ANTHROPIC_CACHE_CONTROL) this._cacheControl = null;
    else {
      const normalized =
        process.env.ANTHROPIC_CACHE_CONTROL.toLowerCase().trim();
      if (["5m", "1h"].includes(normalized))
        this._cacheControl = { type: "ephemeral", ttl: normalized };
      else this._cacheControl = null;
    }
    return this._cacheControl;
  }

  /**
   * Builds system parameter with cache control if applicable
   * @param {string} systemContent - The system prompt content
   * @returns {string|array} System parameter for API call
   */
  #buildSystemPrompt(systemContent) {
    if (!systemContent || !this.cacheControl) return systemContent;
    return [
      {
        type: "text",
        text: systemContent,
        cache_control: this.cacheControl,
      },
    ];
  }

  /**
   * Generates appropriate content array for a message + attachments.
   * @param {{userPrompt:string, attachments: import("../../helpers").Attachment[]}}
   * @returns {string|object[]}
   */
  #generateContent({ userPrompt, attachments = [] }) {
    if (!attachments.length) {
      return userPrompt;
    }

    const content = [{ type: "text", text: userPrompt }];
    for (let attachment of attachments) {
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: attachment.mime,
          data: attachment.contentString.split("base64,")[1],
        },
      });
    }
    return content.flat();
  }

  constructPrompt({
    systemPrompt = "",
    contextTexts = [],
    chatHistory = [],
    userPrompt = "",
    attachments = [], // This is the specific attachment for only this prompt
  }) {
    const prompt = {
      role: "system",
      content: `${systemPrompt}${this.#appendContext(contextTexts)}`,
    };

    return [
      prompt,
      ...formatChatHistory(chatHistory, this.#generateContent),
      {
        role: "user",
        content: this.#generateContent({ userPrompt, attachments }),
      },
    ];
  }

  async getChatCompletion(messages = null, { temperature = 0.7 }) {
    await this.assertModelMaxTokens();
    try {
      const anthropic = await this.#getClient();
      const systemContent = messages[0].content;
      const result = await LLMPerformanceMonitor.measureAsyncFunction(
        anthropic.messages.create({
          model: this.model,
          max_tokens: this.maxTokens,
          system: this.#buildSystemPrompt(systemContent),
          messages: messages.slice(1), // Pop off the system message
          temperature: Number(temperature ?? this.defaultTemp),
        })
      );

      const promptTokens = result.output.usage.input_tokens;
      const completionTokens = result.output.usage.output_tokens;

      return {
        textResponse: result.output.content[0].text,
        metrics: {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: promptTokens + completionTokens,
          outputTps: completionTokens / result.duration,
          duration: result.duration,
          model: this.model,
          provider: this.className,
          timestamp: new Date(),
        },
      };
    } catch (error) {
      console.log(error);
      const statusCode = error?.status || error?.statusCode;
      let friendlyMsg = error?.message || String(error);
      if (statusCode === 429) {
        friendlyMsg = "You've hit the Claude rate limit. Please wait a moment and try again.";
      } else if (statusCode === 401) {
        friendlyMsg = "Claude authentication failed. Go to Settings > AI Providers to reconnect.";
      }
      return { textResponse: friendlyMsg, metrics: {} };
    }
  }

  async streamGetChatCompletion(messages = null, { temperature = 0.7 }) {
    await this.assertModelMaxTokens();
    const anthropic = await this.#getClient();
    const systemContent = messages[0].content;
    const measuredStreamRequest = await LLMPerformanceMonitor.measureStream({
      func: anthropic.messages.stream({
        model: this.model,
        max_tokens: this.maxTokens,
        system: this.#buildSystemPrompt(systemContent),
        messages: messages.slice(1), // Pop off the system message
        temperature: Number(temperature ?? this.defaultTemp),
      }),
      messages,
      runPromptTokenCalculation: false,
      modelTag: this.model,
      provider: this.className,
    });

    return measuredStreamRequest;
  }

  /**
   * Handles the stream response from the Anthropic API.
   * @param {Object} response - the response object
   * @param {import('../../helpers/chat/LLMPerformanceMonitor').MonitoredStream} stream - the stream response from the Anthropic API w/tracking
   * @param {Object} responseProps - the response properties
   * @returns {Promise<string>}
   */
  handleStream(response, stream, responseProps) {
    return new Promise((resolve) => {
      let fullText = "";
      const { uuid = v4(), sources = [] } = responseProps;
      let usage = {
        prompt_tokens: 0,
        completion_tokens: 0,
      };

      // Establish listener to early-abort a streaming response
      // in case things go sideways or the user does not like the response.
      // We preserve the generated text but continue as if chat was completed
      // to preserve previously generated content.
      const handleAbort = () => {
        stream?.endMeasurement(usage);
        clientAbortedHandler(resolve, fullText);
      };
      response.on("close", handleAbort);

      stream.on("error", (event) => {
        const parseErrorMsg = (event) => {
          const error = event?.error?.error;
          const statusCode = event?.status || event?.error?.status;
          
          // Friendly error messages for common issues
          if (statusCode === 429 || error?.type === "rate_limit_error") {
            return "You've hit the Claude rate limit. Please wait a moment and try again. If this persists, your Teams plan may have reached its usage cap for this period.";
          }
          if (statusCode === 401 || error?.type === "authentication_error") {
            return "Claude authentication failed. Your session may have expired — go to Settings > AI Providers > LLM and click 'Sign in with Claude' to reconnect.";
          }
          if (statusCode === 403 || error?.type === "permission_error") {
            return "Your Claude account doesn't have permission for this model. Try selecting a different model in Settings > AI Providers > LLM.";
          }
          if (statusCode === 529 || error?.type === "overloaded_error") {
            return "Claude is currently overloaded. Please wait a minute and try again.";
          }
          if (error?.type === "invalid_request_error") {
            return `Claude request error: ${error?.message || "The request was invalid. Try a shorter message or different model."}`;
          }
          if (!!error)
            return `Claude error (${error?.type || "unknown"}): ${
              error?.message || "An unexpected error occurred. Please try again."
            }`;
          return event.message || "An unexpected error occurred while communicating with Claude.";
        };

        writeResponseChunk(response, {
          uuid,
          sources: [],
          type: "abort",
          textResponse: null,
          close: true,
          error: parseErrorMsg(event),
        });
        response.removeListener("close", handleAbort);
        stream?.endMeasurement(usage);
        resolve(fullText);
      });

      stream.on("streamEvent", (message) => {
        const data = message;

        if (data.type === "message_start")
          usage.prompt_tokens = data?.message?.usage?.input_tokens;
        if (data.type === "message_delta")
          usage.completion_tokens = data?.usage?.output_tokens;

        if (
          data.type === "content_block_delta" &&
          data.delta.type === "text_delta"
        ) {
          const text = data.delta.text;
          fullText += text;

          writeResponseChunk(response, {
            uuid,
            sources,
            type: "textResponseChunk",
            textResponse: text,
            close: false,
            error: false,
          });
        }

        if (
          message.type === "message_stop" ||
          (data.stop_reason && data.stop_reason === "end_turn")
        ) {
          writeResponseChunk(response, {
            uuid,
            sources,
            type: "textResponseChunk",
            textResponse: "",
            close: true,
            error: false,
          });
          response.removeListener("close", handleAbort);
          stream?.endMeasurement(usage);
          resolve(fullText);
        }
      });
    });
  }

  #appendContext(contextTexts = []) {
    if (!contextTexts || !contextTexts.length) return "";
    return (
      "\nContext:\n" +
      contextTexts
        .map((text, i) => {
          return `[CONTEXT ${i}]:\n${text}\n[END CONTEXT ${i}]\n\n`;
        })
        .join("")
    );
  }

  async compressMessages(promptArgs = {}, rawHistory = []) {
    const { messageStringCompressor } = require("../../helpers/chat");
    const compressedPrompt = await messageStringCompressor(
      this,
      promptArgs,
      rawHistory
    );
    return compressedPrompt;
  }

  // Simple wrapper for dynamic embedder & normalize interface for all LLM implementations
  async embedTextInput(textInput) {
    return await this.embedder.embedTextInput(textInput);
  }
  async embedChunks(textChunks = []) {
    return await this.embedder.embedChunks(textChunks);
  }
}

module.exports = {
  AnthropicLLM,
};
