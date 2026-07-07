export default {
  id: "freemodel-dev",
  priority: 80,
  alias: "fmd",
  uiAlias: "fmd",
  display: {
    name: "FreeModel.dev",
    icon: "auto_awesome",
    color: "#8B5CF6",
    textIcon: "FM",
    website: "https://freemodel.dev",
    notice: {
      text: "$300 free credits on signup — no card required. OpenAI-compatible.",
      apiKeyUrl: "https://freemodel.dev/dashboard/keys",
    },
  },
  category: "apikey",
  authType: "apikey",
  hasFree: true,
  authHint:
    "Get $300 free API credits at https://freemodel.dev — no payment info required. OpenAI-compatible endpoint. GPT-5.4 and GPT-5.5 models available.",
  transport: {
    baseUrl: "https://api.freemodel.dev/v1/chat/completions",
    validateUrl: "https://api.freemodel.dev/v1/models",
    auth: { combined: true, header: "Authorization", scheme: "bearer" },
    timeoutMs: 120000,
    retry: { 429: { attempts: 3 }, 503: { attempts: 2 } },
  },
  defaultContextLength: 128000,
  models: [
    { id: "gpt-5.5", name: "GPT-5.5", contextLength: 400000 },
    { id: "gpt-5.4", name: "GPT-5.4", contextLength: 400000 },
    { id: "gpt-5.4-mini", name: "GPT-5.4 Mini" },
    { id: "gpt-5.3-codex", name: "GPT-5.3 Codex" },
  ],
  modelsFetcher: { url: "https://api.freemodel.dev/v1/models", type: "openai" },
  passthroughModels: true,
  serviceKinds: ["llm"],
};
