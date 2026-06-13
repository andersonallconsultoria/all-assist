import http from "node:http";

export function startHealthServer(config, logger) {
  const server = http.createServer((request, response) => {
    if (request.url === "/healthz") {
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.url === "/readyz") {
      sendJson(response, 200, {
        ok: true,
        cissConfigured: Boolean(config.ciss.baseUrl && config.ciss.username),
        crmConfigured: Boolean(config.crm.baseUrl && config.crm.apiKey && config.crm.leadWebhookUrl)
      });
      return;
    }

    sendJson(response, 404, { error: "not found" });
  });

  server.listen(config.port, () => {
    logger.info("health_server_started", { port: config.port });
  });

  return server;
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json" });
  response.end(JSON.stringify(payload));
}
