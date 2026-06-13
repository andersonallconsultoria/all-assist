import { requestJson } from "./http.js";

const DEFAULT_PROVIDER = "ciss";
const CISS_DEFAULT_CLIENT_ID = "cisspoder-oauth";
const CISS_DEFAULT_CLIENT_SECRET = "poder7547";

export class ErpIntegrationService {
  constructor(store, config, logger) {
    this.store = store;
    this.config = config;
    this.logger = logger;
  }

  applyStoredSettings(tenantId = defaultTenantId(this.store)) {
    const settings = this.getStoredSettings(tenantId);
    if (settings) this.applyToRuntimeConfig(settings);
  }

  getPublicSettings(tenantId = defaultTenantId(this.store)) {
    const settings = this.getStoredSettings(tenantId) || this.fromRuntimeConfig();
    return sanitizeSettings({ ...settings, tenantId: settings.tenantId || tenantId });
  }

  updateSettings(input = {}, actor = {}) {
    const tenantId = actor.tenantId || input.tenantId || defaultTenantId(this.store);
    const current = this.getStoredSettings(tenantId) || this.blankPublicSettings(tenantId);
    const next = {
      ...normalizeSettings(input, current),
      tenantId
    };
    const existing = this.getStoredSettings(tenantId);
    const saved = existing
      ? this.store.update("integrationSettings", existing.id, next)
      : this.store.insert("integrationSettings", next);

    this.applyToRuntimeConfig(saved);
    this.logger.info("erp_integration_settings_updated", {
      userId: actor.id || "",
      host: saved.host,
      port: saved.port,
      idEmpresa: saved.idEmpresa
    });
    return sanitizeSettings(saved);
  }

  clearSettings(actor = {}) {
    const tenantId = actor.tenantId || defaultTenantId(this.store);
    const existing = this.getStoredSettings(tenantId);
    if (existing) this.store.remove("integrationSettings", existing.id);

    const blank = this.blankPublicSettings(tenantId);
    this.applyToRuntimeConfig(blank);
    this.logger.info("erp_integration_settings_cleared", {
      userId: actor.id || ""
    });
    return sanitizeSettings(blank);
  }

  async testConnection(input = {}, tenantId = defaultTenantId(this.store)) {
    const current = this.getStoredSettings(tenantId) || this.blankPublicSettings(tenantId);
    const settings = normalizeSettings(input, current);
    const missing = [];
    if (!settings.baseUrl) missing.push("endereco");
    if (!settings.username) missing.push("usuario");
    if (!settings.password) missing.push("senha");
    if (!settings.clientId) missing.push("client ID");
    if (!settings.clientSecret) missing.push("client secret");
    if (missing.length) {
      throw new Error(`Preencha ${missing.join(", ")} para testar a conexao.`);
    }

    const body = new URLSearchParams({
      password: settings.password,
      username: settings.username,
      grant_type: "password",
      client_secret: settings.clientSecret,
      client_id: settings.clientId
    });

    const response = await requestJson(`${settings.baseUrl}/cisspoder-auth/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body
    }, this.config.http);

    const token = response?.access_token || response?.token || response?.accessToken || "";
    if (!token) throw new Error("ERP respondeu, mas nao retornou token de acesso.");

    return {
      ok: true,
      provider: settings.provider,
      baseUrl: settings.baseUrl,
      username: settings.username,
      tokenReceived: true
    };
  }

  getStoredSettings(tenantId = defaultTenantId(this.store)) {
    return this.store.findOne("integrationSettings", (item) => item.type === "erp" && item.tenantId === tenantId) || null;
  }

  fromRuntimeConfig() {
    const parsed = parseBaseUrl(this.config.ciss.baseUrl);
    return {
      type: "erp",
      provider: DEFAULT_PROVIDER,
      protocol: parsed.protocol,
      host: parsed.host,
      port: parsed.port,
      baseUrl: this.config.ciss.baseUrl,
      username: this.config.ciss.username,
      password: this.config.ciss.password,
      clientId: this.config.ciss.clientId,
      clientSecret: this.config.ciss.clientSecret,
      idEmpresa: this.config.ciss.idEmpresa,
      pageLimit: this.config.ciss.pageLimit,
      dtIni: this.config.ciss.dtIni,
      dtFim: this.config.ciss.dtFim,
      lookbackDays: this.config.ciss.lookbackDays,
      lookaheadDays: this.config.ciss.lookaheadDays
    };
  }

  blankPublicSettings(tenantId = defaultTenantId(this.store)) {
    return {
      type: "erp",
      tenantId,
      provider: DEFAULT_PROVIDER,
      protocol: "http",
      host: "",
      port: "",
      baseUrl: "",
      username: "",
      password: "",
      clientId: CISS_DEFAULT_CLIENT_ID,
      clientSecret: "",
      idEmpresa: this.config.ciss.idEmpresa,
      pageLimit: this.config.ciss.pageLimit,
      dtIni: this.config.ciss.dtIni,
      dtFim: this.config.ciss.dtFim,
      lookbackDays: this.config.ciss.lookbackDays,
      lookaheadDays: this.config.ciss.lookaheadDays
    };
  }

  applyToRuntimeConfig(settings) {
    this.config.ciss.baseUrl = settings.baseUrl;
    this.config.ciss.username = settings.username || "";
    this.config.ciss.password = settings.password || "";
    this.config.ciss.clientId = settings.clientId || CISS_DEFAULT_CLIENT_ID;
    this.config.ciss.clientSecret = settings.clientSecret || CISS_DEFAULT_CLIENT_SECRET;
    this.config.ciss.idEmpresa = numberOrDefault(settings.idEmpresa, 1);
    this.config.ciss.pageLimit = numberOrDefault(settings.pageLimit, 1000);
    this.config.ciss.dtIni = settings.dtIni || "";
    this.config.ciss.dtFim = settings.dtFim || "";
    this.config.ciss.lookbackDays = numberOrDefault(settings.lookbackDays, 30);
    this.config.ciss.lookaheadDays = numberOrDefault(settings.lookaheadDays, 180);
  }
}

function normalizeSettings(input, current) {
  const protocolInput = fieldValue(input, "protocol", current.protocol || "http");
  const protocol = ["http", "https"].includes(String(protocolInput || "").replace(":", ""))
    ? String(protocolInput).replace(":", "")
    : "http";
  const host = String(fieldValue(input, "host", current.host || "")).trim();
  const port = String(fieldValue(input, "port", current.port || "")).trim();
  const baseUrl = buildBaseUrl({ protocol, host, port });
  const clientSecretInput = fieldValue(input, "clientSecret", "");
  const clientSecret = clientSecretInput
    ? String(clientSecretInput)
    : current.clientSecret || CISS_DEFAULT_CLIENT_SECRET;

  return {
    type: "erp",
    provider: fieldValue(input, "provider", current.provider || DEFAULT_PROVIDER) || DEFAULT_PROVIDER,
    protocol,
    host,
    port,
    baseUrl,
    username: String(fieldValue(input, "username", current.username || "")).trim(),
    password: fieldValue(input, "password", "") ? String(input.password) : current.password || "",
    clientId: String(fieldValue(input, "clientId", current.clientId || CISS_DEFAULT_CLIENT_ID)).trim() || CISS_DEFAULT_CLIENT_ID,
    clientSecret,
    idEmpresa: numberOrDefault(input.idEmpresa ?? current.idEmpresa, 1),
    pageLimit: numberOrDefault(input.pageLimit ?? current.pageLimit, 1000),
    dtIni: String(input.dtIni ?? current.dtIni ?? "").trim(),
    dtFim: String(input.dtFim ?? current.dtFim ?? "").trim(),
    lookbackDays: numberOrDefault(input.lookbackDays ?? current.lookbackDays, 30),
    lookaheadDays: numberOrDefault(input.lookaheadDays ?? current.lookaheadDays, 180)
  };
}

function sanitizeSettings(settings) {
  const usesDefaultClientSecret = !settings.clientSecret || settings.clientSecret === CISS_DEFAULT_CLIENT_SECRET;
  return {
    id: settings.id || "",
    tenantId: settings.tenantId || "",
    provider: settings.provider || DEFAULT_PROVIDER,
    protocol: settings.protocol || "http",
    host: settings.host || "",
    port: settings.port || "",
    baseUrl: settings.baseUrl || "",
    username: settings.username || "",
    passwordConfigured: Boolean(settings.password),
    clientId: settings.clientId || CISS_DEFAULT_CLIENT_ID,
    clientSecret: settings.clientSecret || CISS_DEFAULT_CLIENT_SECRET,
    clientSecretConfigured: Boolean(settings.clientSecret && !usesDefaultClientSecret),
    clientSecretUsesDefault: usesDefaultClientSecret,
    idEmpresa: settings.idEmpresa || 1,
    pageLimit: settings.pageLimit || 1000,
    dtIni: settings.dtIni || "",
    dtFim: settings.dtFim || "",
    lookbackDays: settings.lookbackDays || 30,
    lookaheadDays: settings.lookaheadDays || 180,
    updatedAt: settings.updatedAt || ""
  };
}

function fieldValue(input, key, fallback) {
  return Object.prototype.hasOwnProperty.call(input, key) ? input[key] : fallback;
}

function parseBaseUrl(baseUrl) {
  if (!baseUrl) {
    return {
      protocol: "http",
      host: "",
      port: ""
    };
  }

  try {
    const url = new URL(baseUrl);
    return {
      protocol: url.protocol.replace(":", "") || "http",
      host: url.hostname || "",
      port: url.port || (url.protocol === "https:" ? "443" : "80")
    };
  } catch {
    return {
      protocol: "http",
      host: "",
      port: ""
    };
  }
}

function buildBaseUrl({ protocol, host, port }) {
  const cleanHost = String(host || "").replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!cleanHost) return "";
  return `${protocol}://${cleanHost}${port ? `:${port}` : ""}`.replace(/\/+$/, "");
}

function numberOrDefault(value, fallback) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? number : fallback;
}

function defaultTenantId(store) {
  return store.findOne("tenants", (tenant) => tenant.slug === "default")?.id || store.list("tenants")[0]?.id || "tenant_default";
}
