import http from "http";
import https from "https";

// ── Active proxy servers keyed by port ──────────────────────────────────
const proxies = new Map();

/**
 * Start a local reverse proxy on the given port that forwards all
 * /v1/* requests to 9router's main endpoint on the same host.
 * Also intercepts /v1/models to return the 9router model list.
 *
 * @param {number} port      - Port to listen on (e.g. 8080 for llama.cpp, 1234 for LM Studio)
 * @param {number} routerPort - 9router's main port (e.g. 20128)
 * @param {string} apiKey    - API key for auth passthrough (or "sk_9router")
 */
export function startProxy(port, routerPort, apiKey = "sk_9router") {
  if (proxies.has(port)) return { port, status: "already_running" };

  const routerUrl = `http://127.0.0.1:${routerPort}`;

  const server = http.createServer((req, res) => {
    // CORS headers for local tools
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "*");

    if (req.method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return;
    }

    // Health check
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", forwarding: `port ${port} → ${routerPort}` }));
      return;
    }

    // Forward to 9router
    const targetUrl = `${routerUrl}${req.url}`;
    const bodyChunks = [];

    req.on("data", (chunk) => bodyChunks.push(chunk));
    req.on("end", () => {
      const body = Buffer.concat(bodyChunks);
      const headers = { ...req.headers };
      // Rewrite host to point to 9router
      headers.host = `127.0.0.1:${routerPort}`;
      // Inject API key if not already present
      if (!headers.authorization) {
        headers.authorization = `Bearer ${apiKey}`;
      }

      const proxyReq = http.request(targetUrl, {
        method: req.method,
        headers,
      }, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res);
      });

      proxyReq.on("error", (err) => {
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Proxy error", detail: err.message }));
      });

      if (body.length > 0) proxyReq.write(body);
      proxyReq.end();
    });
  });

  server.on("error", (err) => {
    console.error(`[proxy:${port}]`, err.message);
  });

  server.listen(port, "127.0.0.1", () => {
    console.log(`[proxy:${port}] forwarding to 9router:${routerPort}`);
  });

  proxies.set(port, server);
  return { port, status: "started" };
}

/**
 * Stop a proxy server on the given port.
 */
export function stopProxy(port) {
  const server = proxies.get(port);
  if (!server) return { port, status: "not_running" };
  server.close();
  proxies.delete(port);
  return { port, status: "stopped" };
}

/**
 * Check if a proxy is running on the given port.
 */
export function proxyStatus(port) {
  return { port, running: proxies.has(port) };
}

/**
 * Stop all proxy servers.
 */
export function stopAllProxies() {
  for (const [port, server] of proxies) {
    try { server.close(); } catch {}
    proxies.delete(port);
  }
}
