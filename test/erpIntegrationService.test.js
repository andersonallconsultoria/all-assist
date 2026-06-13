import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { CrmDataStore } from "../src/crmDataStore.js";
import { ErpIntegrationService } from "../src/erpIntegrationService.js";

test("ErpIntegrationService saves settings and masks secrets", () => {
  const { store, config, service } = createService();

  const publicSettings = service.updateSettings({
    protocol: "http",
    host: "192.168.0.10",
    port: "4664",
    username: "ANDERSON",
    password: "1",
    clientId: "cisspoder-oauth",
    clientSecret: "poder7547"
  });

  assert.equal(publicSettings.baseUrl, "http://192.168.0.10:4664");
  assert.equal(publicSettings.passwordConfigured, true);
  assert.equal(publicSettings.clientSecretConfigured, false);
  assert.equal(publicSettings.clientSecretUsesDefault, true);
  assert.equal(publicSettings.password, undefined);
  assert.equal(publicSettings.clientSecret, "poder7547");
  assert.equal(config.ciss.username, "ANDERSON");
  assert.equal(config.ciss.password, "1");
  assert.equal(config.ciss.clientSecret, "poder7547");
  assert.equal(config.ciss.idEmpresa, 1);
  assert.equal(store.list("integrationSettings").length, 1);
});

test("ErpIntegrationService public defaults fall back to runtime config when no stored settings", () => {
  const { service } = createService();

  const settings = service.getPublicSettings();

  assert.equal(settings.host, "127.0.0.1");
  assert.equal(settings.port, "4664");
  assert.equal(settings.username, "");
  assert.equal(settings.passwordConfigured, false);
  assert.equal(settings.clientId, "cisspoder-oauth");
  assert.equal(settings.clientSecret, "poder7547");
  assert.equal(settings.clientSecretConfigured, false);
  assert.equal(settings.clientSecretUsesDefault, true);
});

test("ErpIntegrationService does not fallback to local env when saving blank settings", () => {
  const { config, service } = createService();

  const settings = service.updateSettings({
    protocol: "http",
    host: "",
    port: "",
    username: "",
    password: "",
    clientId: "cisspoder-oauth",
    clientSecret: ""
  });

  assert.equal(settings.host, "");
  assert.equal(settings.port, "");
  assert.equal(settings.baseUrl, "");
  assert.equal(settings.username, "");
  assert.equal(settings.passwordConfigured, false);
  assert.equal(config.ciss.baseUrl, "");
  assert.equal(config.ciss.username, "");
  assert.equal(config.ciss.clientSecret, "poder7547");
});

test("ErpIntegrationService keeps existing secrets when fields are omitted", () => {
  const { config, service } = createService();
  service.updateSettings({
    host: "192.168.0.10",
    password: "old-password",
    clientSecret: "old-secret"
  });

  service.updateSettings({
    host: "erp.local",
    port: "8080"
  });

  assert.equal(config.ciss.baseUrl, "http://erp.local:8080");
  assert.equal(config.ciss.password, "old-password");
  assert.equal(config.ciss.clientSecret, "old-secret");
});

test("ErpIntegrationService clears stored settings", () => {
  const { store, service } = createService();
  service.updateSettings({
    host: "192.168.0.10",
    username: "ANDERSON",
    password: "1",
    clientSecret: "custom-secret"
  });

  const settings = service.clearSettings({ id: "user_test" });

  assert.equal(store.list("integrationSettings").length, 0);
  assert.equal(settings.host, "");
  assert.equal(settings.username, "");
  assert.equal(settings.passwordConfigured, false);
});

test("ErpIntegrationService tests token generation without exposing token", async () => {
  const server = http.createServer(async (request, response) => {
    assert.equal(request.method, "POST");
    assert.equal(request.url, "/cisspoder-auth/oauth/token");
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ access_token: "secret-token" }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const { service } = createService();
    const { port } = server.address();
    const result = await service.testConnection({
      protocol: "http",
      host: "127.0.0.1",
      port,
      username: "ANDERSON",
      password: "1",
      clientId: "cisspoder-oauth",
      clientSecret: "poder7547"
    });

    assert.equal(result.ok, true);
    assert.equal(result.tokenReceived, true);
    assert.equal(result.access_token, undefined);
    assert.equal(result.baseUrl, `http://127.0.0.1:${port}`);
  } finally {
    server.close();
  }
});

function createService() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "erp-settings-"));
  const store = new CrmDataStore(path.join(dir, "crm.json"));
  store.load();
  const config = {
    ciss: {
      baseUrl: "http://127.0.0.1:4664",
      username: "",
      password: "",
      clientId: "cisspoder-oauth",
      clientSecret: "",
      idEmpresa: 1,
      pageLimit: 1000,
      dtIni: "",
      dtFim: "",
      lookbackDays: 30,
      lookaheadDays: 180
    },
    http: {
      timeoutMs: 5000,
      retries: 0,
      retryDelayMs: 1
    }
  };
  return {
    store,
    config,
    service: new ErpIntegrationService(store, config, silentLogger())
  };
}

function silentLogger() {
  return {
    info() {}
  };
}
