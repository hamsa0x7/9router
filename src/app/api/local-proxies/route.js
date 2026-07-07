import { NextResponse } from "next/server";
import { getSettings } from "@/lib/localDb";
import { startProxy, stopProxy, proxyStatus, stopAllProxies } from "@/lib/localProxies";

const LMSTUDIO_PORT = 1234;
const LLAMACPP_PORT = 8080;

function getRouterPort() {
  return parseInt(process.env.PORT || "20128", 10);
}

function getSettingsApiKey(settings) {
  // Use a known API key from the settings or the default
  const keys = settings.apiKeys || [];
  return keys.length > 0 ? keys[0].key : "sk_9router";
}

export async function GET() {
  try {
    const settings = await getSettings();
    const routerPort = getRouterPort();

    return NextResponse.json({
      lmstudio: { ...proxyStatus(LMSTUDIO_PORT), label: "LM Studio (port 1234)" },
      llamacpp: { ...proxyStatus(LLAMACPP_PORT), label: "llama.cpp (port 8080)" },
      routerPort,
      settingsEnabled: {
        lmstudio: settings.lmstudioProxyEnabled === true,
        llamacpp: settings.llamacppProxyEnabled === true,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { action, service } = await request.json();

    if (!service || !["lmstudio", "llamacpp"].includes(service)) {
      return NextResponse.json({ error: "Invalid service" }, { status: 400 });
    }

    const port = service === "lmstudio" ? LMSTUDIO_PORT : LLAMACPP_PORT;
    const settings = await getSettings();
    const routerPort = getRouterPort();
    const apiKey = getSettingsApiKey(settings);

    if (action === "start") {
      // Auto-start setting: enable in settings if we start so it persists across restarts
      const { updateSettings } = await import("@/lib/localDb");
      const key = service === "lmstudio" ? "lmstudioProxyEnabled" : "llamacppProxyEnabled";
      await updateSettings({ [key]: true });

      const result = startProxy(port, routerPort, apiKey);
      return NextResponse.json(result);
    }

    if (action === "stop") {
      const { updateSettings } = await import("@/lib/localDb");
      const key = service === "lmstudio" ? "lmstudioProxyEnabled" : "llamacppProxyEnabled";
      await updateSettings({ [key]: false });

      const result = stopProxy(port);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
