// MITM Tools — IDE tools intercepted via MITM proxy
export const MITM_TOOLS = {
};

// CLI Tools configuration
export const CLI_TOOLS = {
  "codewhale": {
    id: "codewhale",
    name: "CodeWhale",
    image: "/providers/codewhale.png",
    color: "#4D6BFE",
    description: "CodeWhale terminal coding agent with multi-provider support",
    docsUrl: "https://github.com/Hmbown/CodeWhale",
    configType: "custom",
    defaultCommand: "codewhale",
    modelAliases: ["deepseek-v4-pro", "deepseek-v4-flash", "deepseek-chat", "deepseek-reasoner", "gpt-4.1", "glm-5"],
    defaultModels: [
      { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro", alias: "deepseek-v4-pro" },
      { id: "deepseek-v4-flash", name: "DeepSeek V4 Flash", alias: "deepseek-v4-flash" },
      { id: "deepseek-chat", name: "DeepSeek V3 Chat", alias: "deepseek-chat" },
      { id: "gpt-4.1", name: "GPT-4.1", alias: "gpt-4.1" },
    ],
    notes: [
      { type: "info", text: "Note: deepseek-tui has been deprecated and replaced by CodeWhale." },
      { type: "info", text: "CodeWhale uses ~/.codewhale/config.toml. 9Router seeds the OpenAI provider entry so you can point CodeWhale at 9Router and still switch to its other providers later." },
      { type: "warning", text: "Config path: Linux/macOS ~/.codewhale/config.toml • Windows %USERPROFILE%\\.codewhale\\config.toml" },
    ],
  },
  omp: {
    id: "omp",
    name: "Oh My Pi",
    image: "/providers/omp.png",
    color: "#111111",
    description: "Oh My Pi terminal coding agent via 9Router",
    configType: "custom",
    defaultCommand: "omp",
    notes: [
      { type: "info", text: "Oh My Pi reads custom OpenAI-compatible providers from ~/.omp/agent/models.yml. 9Router adds itself as a provider with auto-discovery — models appear automatically in omp's /model menu." },
      { type: "warning", text: "Config path: Linux/macOS ~/.omp/agent/models.yml • Windows %USERPROFILE%\\.omp\\agent\\models.yml" },
    ],
  },
  pi: {
    id: "pi",
    name: "Pi",
    image: "/providers/pi.svg",
    color: "#111111",
    description: "Pi terminal coding harness via 9Router",
    docsUrl: "https://pi.dev",
    configType: "custom",
    defaultCommand: "pi",
    notes: [
      { type: "info", text: "Pi reads custom OpenAI-compatible providers from ~/.pi/agent/models.json. Add 9Router there, then select the 9Router model from Pi's /model menu." },
      { type: "warning", text: "Config path: Linux/macOS ~/.pi/agent/models.json • Windows %USERPROFILE%\\.pi\\agent\\models.json" },
    ],
    guideSteps: [
      { step: 1, title: "Install Pi", desc: "npm install -g @earendil-works/pi-coding-agent" },
      { step: 2, title: "API Key", type: "apiKeySelector" },
      { step: 3, title: "Base URL", value: "{{baseUrl}}", copyable: true },
      { step: 4, title: "Select Model", type: "modelSelector" },
      { step: 5, title: "Save Config", desc: "Copy the JSON below to ~/.pi/agent/models.json, then run pi and choose the model with /model." },
    ],
    codeBlock: {
      language: "json",
      code: `{
  "providers": {
    "9router": {
      "baseUrl": "{{baseUrl}}",
      "api": "openai-completions",
      "apiKey": "{{apiKey}}",
      "authHeader": true,
      "models": [
        {
          "id": "{{model}}",
          "name": "{{model}} via 9Router",
          "reasoning": true,
          "input": ["text", "image"],
          "contextWindow": 200000,
          "maxTokens": 32000
        }
      ]
    }
  }
}`,
    },
  },
  letta: {
    id: "letta",
    name: "Letta Cli",
    image: "/providers/letta.png",
    color: "#FF6B35",
    description: "Letta CLI — AI agent with persistent memory and tool use",
    configType: "custom",
    docsUrl: "https://docs.letta.com",
    notes: [
      {
        type: "info",
        text: "Letta CLI uses pi-ai which sends OpenAI-compatible requests. 9Router configures it as an OpenAI provider with custom base URL."
      },
      {
        type: "info",
        text: "CLI (Local Mode): 9Router auto-configures ~/.letta/lc-local-backend/providers/auth.json. Use 'letta --info' to check if local mode is enabled."
      },
      {
        type: "info",
        text: "Desktop App: Use the /connect command in Letta's TUI: '/connect openai --base-url <9router>/v1 --api-key <key>' then select models."
      },
      {
        type: "warning",
        text: "Local mode config path: ~/.letta/lc-local-backend/providers/auth.json (CLI only)"
      },
    ],
  },
};

// Get all provider models for mapping dropdown
export const getProviderModelsForMapping = (providers) => {
  const result = [];
  providers.forEach(conn => {
    if (conn.isActive && (conn.testStatus === "active" || conn.testStatus === "success")) {
      result.push({
        connectionId: conn.id,
        provider: conn.provider,
        name: conn.name,
        models: conn.models || [],
      });
    }
  });
  return result;
};
