const { safeJsonParse } = require("../../http");

/**
 * Execute an API call flow step
 * @param {Object} config Flow step configuration
 * @param {Object} context Execution context with introspect function
 * @returns {Promise<string>} Response data
 */
async function executeApiCall(config, context) {
  function validateUrl(urlString) {
    try {
      const url = new URL(urlString);
      // Block private/internal IPs
      const hostname = url.hostname.toLowerCase();
      const blocked = [
        'localhost', '127.0.0.1', '0.0.0.0', '::1',
        '169.254.169.254', // AWS metadata
        'metadata.google.internal', // GCP metadata
      ];
      if (blocked.includes(hostname)) {
        throw new Error(`URL blocked: ${hostname} is not allowed`);
      }
      // Block private IP ranges
      if (/^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)/.test(hostname)) {
        throw new Error(`URL blocked: private IP range not allowed`);
      }
      // Only allow http/https
      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error(`URL blocked: only HTTP/HTTPS allowed`);
      }
      return url.toString();
    } catch (e) {
      throw new Error(`Invalid URL: ${e.message}`);
    }
  }

  const { url, method, headers = [], body, bodyType, formData } = config;
  const { introspect, logger } = context;
  logger(`\x1b[43m[AgentFlowToolExecutor]\x1b[0m - executing API Call block`);
  
  // Validate URL before making request
  const validatedUrl = validateUrl(url);
  introspect(`Making ${method} request to external API...`);

  const requestConfig = {
    method,
    headers: headers.reduce((acc, h) => ({ ...acc, [h.key]: h.value }), {}),
  };

  if (["POST", "PUT", "PATCH"].includes(method)) {
    if (bodyType === "form") {
      const formDataObj = new URLSearchParams();
      formData.forEach(({ key, value }) => formDataObj.append(key, value));
      requestConfig.body = formDataObj.toString();
      requestConfig.headers["Content-Type"] =
        "application/x-www-form-urlencoded";
    } else if (bodyType === "json") {
      const parsedBody = safeJsonParse(body, null);
      if (parsedBody !== null) {
        requestConfig.body = JSON.stringify(parsedBody);
      }
      requestConfig.headers["Content-Type"] = "application/json";
    } else if (bodyType === "text") {
      requestConfig.body = String(body);
    } else {
      requestConfig.body = body;
    }
  }

  try {
    introspect(`Sending body to ${validatedUrl}: ${requestConfig?.body || "No body"}`);
    const response = await fetch(validatedUrl, requestConfig);
    if (!response.ok) {
      introspect(`Request failed with status ${response.status}`);
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    introspect(`API call completed`);
    return await response
      .text()
      .then((text) =>
        safeJsonParse(text, "Failed to parse output from API call block")
      );
  } catch (error) {
    console.error(error);
    throw new Error(`API Call failed: ${error.message}`);
  }
}

module.exports = executeApiCall;
