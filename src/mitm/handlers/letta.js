const { err } = require("../logger");
const { forwardToRouter, pipeSSE } = require("./base");

/**
 * MITM proxy for Letta Code (desktop app / MITM mode).
 * Intercepts OpenAI-compatible requests, swaps the model with the 9Router-mapped
 * model, then forwards to 9Router preserving the original path + method.
 *
 * Flow: Letta Code picks any model → MITM extracts it → getMappedModel() resolves
 * the 9Router alias → handler swaps model in body → 9Router routes to real provider.
 */
async function intercept(req, res, bodyBuffer, mappedModel, passthrough) {
  try {
    // If no mapped model (user hasn't configured one in 9Router), passthrough
    if (!mappedModel) {
      return passthrough(req, res, bodyBuffer);
    }

    let body = bodyBuffer;
    if (bodyBuffer.length > 0) {
      try {
        const json = JSON.parse(bodyBuffer.toString());
        json.model = mappedModel;
        body = Buffer.from(JSON.stringify(json));
      } catch {
        // Non-JSON body (e.g. multipart) — forward as-is with model unchanged
      }
    }

    const routerRes = await forwardToRouter({
      path: req.url,
      method: req.method,
      body: body.length > 0 ? body : null,
      clientHeaders: req.headers,
      contentType: body.length > 0 ? (req.headers["content-type"] || "application/json") : undefined,
    });
    await pipeSSE(routerRes, res);
  } catch (error) {
    err(`[letta] ${error.message}`);
    if (!res.headersSent) res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: { message: error.message, type: "mitm_error" } }));
  }
}

module.exports = { intercept };
