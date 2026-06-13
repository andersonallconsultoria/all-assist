import { loadConfig } from "./config.js";

export function loadPlatformConfig(argv = process.argv.slice(2)) {
  const config = loadConfig(argv);

  config.crmProvider = process.env.CRM_PROVIDER || "local";
  config.crmDataFile = process.env.CRM_DATA_FILE || "data/crm.json";
  config.syncOnce = argv.includes("--sync-once");
  config.disableScheduler = argv.includes("--no-scheduler") || process.env.DISABLE_SCHEDULER === "true";
  config.publicBaseUrl = process.env.PUBLIC_BASE_URL || `http://localhost:${config.port}`;

  config.meta = {
    graphVersion: process.env.META_GRAPH_VERSION || "v23.0",
    phoneNumberId: process.env.META_PHONE_NUMBER_ID || "",
    wabaId: process.env.META_WABA_ID || "",
    accessToken: process.env.META_ACCESS_TOKEN || "",
    webhookVerifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN || "",
    appSecret: process.env.META_APP_SECRET || "",
    markInboundRead: (process.env.META_MARK_INBOUND_READ || "true").toLowerCase() === "true"
  };

  config.auth = {
    bootstrapAdminName: envValue(["ALLASSIST_BOOTSTRAP_ADMIN_NAME"], "Administrador"),
    bootstrapAdminEmail: envValue(["ALLASSIST_BOOTSTRAP_ADMIN_EMAIL"], "admin@allassist.local"),
    bootstrapAdminPassword: envValue(["ALLASSIST_BOOTSTRAP_ADMIN_PASSWORD"], "admin123"),
    bootstrapMasterName: envValue(["ALLASSIST_BOOTSTRAP_MASTER_NAME"], ""),
    bootstrapMasterEmail: envValue(["ALLASSIST_BOOTSTRAP_MASTER_EMAIL"], ""),
    bootstrapMasterPassword: envValue(["ALLASSIST_BOOTSTRAP_MASTER_PASSWORD"], "master123"),
    sessionSecret: envValue(["ALLASSIST_SESSION_SECRET"], "change-this-secret"),
    sessionTtlHours: Number.parseInt(envValue(["ALLASSIST_SESSION_TTL_HOURS"], "12"), 10)
  };

  config.saas = {
    baseDomain: process.env.SAAS_BASE_DOMAIN || "*.allassist.com.br",
    masterSubdomain: process.env.SAAS_MASTER_SUBDOMAIN || "admin",
    activeTenantCookie: process.env.SAAS_ACTIVE_TENANT_COOKIE || "allassist_active_tenant"
  };

  try {
    config.seedTenants = process.env.ALLASSIST_SEED_TENANTS
      ? JSON.parse(process.env.ALLASSIST_SEED_TENANTS)
      : [];
  } catch {
    config.seedTenants = [];
  }

  config.alerts = {
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || "",
    telegramChatId: process.env.TELEGRAM_CHAT_ID || "",
    notifyServerErrors: (process.env.TELEGRAM_NOTIFY_SERVER_ERRORS || "true").toLowerCase() === "true",
    notifyIntegrationFailures: (process.env.TELEGRAM_NOTIFY_INTEGRATION_FAILURES || "true").toLowerCase() === "true"
  };

  return config;
}

function envValue(names, fallback = "") {
  for (const name of names) {
    const value = process.env[name];
    if (value !== undefined && value !== "") return value;
  }
  return fallback;
}
