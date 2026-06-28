import fs from "node:fs";
import path from "node:path";

function loadDotEnv(filePath = ".env") {
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex < 0) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function boolFromEnv(name, defaultValue = false) {
  const value = process.env[name];
  if (value === undefined || value === "") return defaultValue;
  return ["1", "true", "yes", "sim", "on"].includes(value.toLowerCase());
}

function intFromEnv(name, defaultValue) {
  const value = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(value) ? value : defaultValue;
}

function jsonFromEnv(name, defaultValue) {
  const value = process.env[name];
  if (!value) return defaultValue;

  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`Invalid JSON in ${name}: ${error.message}`);
  }
}

function stripTrailingSlash(value) {
  return value ? value.replace(/\/+$/, "") : value;
}

export function loadConfig(argv = process.argv.slice(2)) {
  loadDotEnv();

  const runOnce = argv.includes("--once") || boolFromEnv("RUN_ONCE", false);
  const dryRun = argv.includes("--dry-run") || boolFromEnv("DRY_RUN", false);

  const config = {
    nodeEnv: process.env.NODE_ENV || "development",
    logLevel: process.env.LOG_LEVEL || "info",
    logFile: process.env.LOG_FILE || "",
    stateFile: process.env.STATE_FILE || path.join("data", "state.json"),
    pollIntervalMs: intFromEnv("POLL_INTERVAL_MS", 60_000),
    port: intFromEnv("PORT", 3000),
    enableHealthServer: boolFromEnv("ENABLE_HEALTH_SERVER", !runOnce),
    runOnce,
    dryRun,
    forceResync: boolFromEnv("FORCE_RESYNC", false),
    crmProvider: process.env.CRM_PROVIDER || "local",
    ciss: {
      baseUrl: stripTrailingSlash(process.env.CISS_BASE_URL || "http://127.0.0.1:4664"),
      username: process.env.CISS_USERNAME || "",
      password: process.env.CISS_PASSWORD || "",
      clientId: process.env.CISS_CLIENT_ID || "cisspoder-oauth",
      clientSecret: process.env.CISS_CLIENT_SECRET || "",
      idEmpresa: intFromEnv("CISS_IDEMPRESA", 1),
      pageLimit: intFromEnv("CISS_PAGE_LIMIT", 1000),
      dtIni: process.env.CISS_DTINI || "",
      dtFim: process.env.CISS_DTFIM || "",
      lookbackDays: intFromEnv("CISS_LOOKBACK_DAYS", 30),
      lookaheadDays: intFromEnv("CISS_LOOKAHEAD_DAYS", 180)
    },
    crm: {
      baseUrl: stripTrailingSlash(process.env.CRM_BASE_URL || ""),
      apiKey: process.env.CRM_API_KEY || "",
      leadWebhookUrl: process.env.CRM_LEAD_WEBHOOK_URL || "",
      defaultStep: process.env.CRM_DEFAULT_STEP || "Entrada",
      defaultResponsible: process.env.CRM_DEFAULT_RESPONSIBLE || "",
      stageMap: jsonFromEnv("CRM_STAGE_MAP_JSON", {
        PENDENTE: "Entrada",
        EFETIVADO: "Venda efetivada",
        FATURADO: "Gerou documento fiscal",
        NEGADO: "Pedido negado"
      }),
      sendOrderCustomFields: boolFromEnv("CRM_SEND_ORDER_CUSTOM_FIELDS", false),
      sendContactFields: boolFromEnv("CRM_SEND_CONTACT_FIELDS", true),
      tlsRejectUnauthorized: boolFromEnv("CRM_TLS_REJECT_UNAUTHORIZED", true),
      failOnReusedOrderId: boolFromEnv("CRM_FAIL_ON_REUSED_ORDER_ID", true)
    },
    http: {
      timeoutMs: intFromEnv("HTTP_TIMEOUT_MS", 30_000),
      retries: intFromEnv("HTTP_RETRIES", 2),
      retryDelayMs: intFromEnv("HTTP_RETRY_DELAY_MS", 1000)
    },
    // IA (classificador, bot, assistente, resumidor de atendimento)
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
    classifierModel: process.env.CLASSIFIER_MODEL || "claude-haiku-4-5-20251001"
  };

  validateConfig(config);
  return config;
}

function validateConfig(config) {
  const missing = [];
  if (!config.ciss.baseUrl) missing.push("CISS_BASE_URL");
  if (config.crmProvider !== "local") {
    if (!config.ciss.username) missing.push("CISS_USERNAME");
    if (!config.ciss.password) missing.push("CISS_PASSWORD");
    if (!config.ciss.clientSecret) missing.push("CISS_CLIENT_SECRET");
    if (!config.crm.apiKey) missing.push("CRM_API_KEY");
    if (!config.crm.leadWebhookUrl) missing.push("CRM_LEAD_WEBHOOK_URL");
  }

  if (missing.length) {
    throw new Error(`Missing required configuration: ${missing.join(", ")}`);
  }
}
