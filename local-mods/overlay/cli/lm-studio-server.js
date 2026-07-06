#!/usr/bin/env node
/**
 * llama.cpp compatible API server for 9router
 * Proxies /v1/* requests to the main 9router API at /api/v1/*
 * Allows tools that expect llama.cpp (port 8080) to use 9router as backend
 */

const http = require("http");
const { URL } = require("url");

const DEFAULT_LM_STUDIO_PORT = 1234;
const DEFAULT_MAIN_PORT = 20128;

function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    lmStudioPort: DEFAULT_LM_STUDIO_PORT,
    mainPort: DEFAULT_MAIN_PORT,
    mainHost: "localhost",
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--lm-studio-port" || args[i] === "-p") {
      config.lmStudioPort = parseInt(args[i + 1], 10) || DEFAULT_LM_STUDIO_PORT;
      i++;
    } else if (args[i] === "--main-port") {
      config.mainPort = parseInt(args[i + 1], 10) || DEFAULT_MAIN_PORT;
      i++;
    } else if (args[i] === "--main-host") {
      config.mainHost = args[i + 1] || "localhost";
      i++;
    } else if (args[i] === "--help" || args[i] === "-h") {
      console.log(`
llama.cpp compatible API server for 9router

Usage: node lm-studio-server.js [options]

Options:
  --lm-studio-port, -p <port>   Port for LM Studio compatible API (default: ${DEFAULT_LM_STUDIO_PORT})
  --main-port <port>        Main 9router server port (default: ${DEFAULT_MAIN_PORT})
  --main-host <host>          Main 9router server host (default: localhost)
  --help, -h               Show this help

This server proxies /v1/* requests to http://<main-host>:<main-port>/api/v1/*
allowing tools that expect llama.cpp on port 8080 to use 9router as backend.
`);
      process.exit(0);
    }
  }
  return config;
}

function createProxyServer(config) {
  const targetBase = `http://${config.mainHost}:${config.mainPort}`;

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${config.lmStudioPort}`);
    const fs = require("fs");
    function logMsg(msg) { fs.appendFileSync("C:\\Users\\JoJo\\llama-log.txt", msg + "\\n"); }

    logMsg(`[llama-cpp] <- ${req.method} ${url.pathname}`);
    if (!url.pathname.startsWith("/v1/")) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: "Not found", type: "not_found" } }));
      return;
    }

    // Rewrite /v1/* -> /api/v1/*
    const targetPath = url.pathname.replace(/^\/v1/, "/api/v1");
    const targetUrl = `${targetBase}${targetPath}${url.search}`;

    try {
      // Prepare headers
      const headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "*",
      };

      // Handle CORS preflight
      if (req.method === "OPTIONS") {
        res.writeHead(204, headers);
        res.end();
        return;
      }

      // Forward request to main server
      const body = req.method !== "GET" && req.method !== "HEAD"
        ? await new Promise((resolve) => {
            let data = "";
            req.on("data", chunk => data += chunk);
            req.on("end", () => resolve(data || undefined));
          })
        : undefined;

      logMsg(`[llama-cpp] Headers: ${JSON.stringify(req.headers)}`);

      const response = await fetch(targetUrl, {
        method: req.method,
        headers: {
          "Content-Type": "application/json",
          ...(req.headers.authorization && { Authorization: req.headers.authorization }),
          ...(req.headers["x-api-key"] && { "x-api-key": req.headers["x-api-key"] }),
        },
        body,
        signal: AbortSignal.timeout(120000),
      });

      logMsg(`[llama-cpp] -> ${response.status} from 9router`);

      // Stream response back
      res.writeHead(response.status, headers);

      if (response.body) {
        const reader = response.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
      }
      res.end();

    } catch (error) {
      console.error(`[llama-cpp] Proxy error: ${error.message}`);
      if (!res.headersSent) {
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { message: "Bad gateway", type: "server_error" } }));
      } else {
        res.end();
      }
    }
  });
}

async function main() {
  const config = parseArgs();
  const server = createProxyServer(config);

  server.listen(config.lmStudioPort, "0.0.0.0", () => {
    console.log(`[lm-studio] Server running at http://0.0.0.0:${config.lmStudioPort}/v1`);
    console.log(`[lm-studio] Proxying to http://${config.mainHost}:${config.mainPort}/api/v1`);
    console.log(`[lm-studio] Tools can now connect to 9router as LM Studio backend`);
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(`[lm-studio] Port ${config.lmStudioPort} already in use`);
    } else {
      console.error(`[lm-studio] Server error: ${err.message}`);
    }
    process.exit(1);
  });

  // Graceful shutdown
  const shutdown = () => {
    console.log("\n[llama-cpp] Shutting down...");
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 2000);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  process.on("SIGHUP", shutdown);
}

main();