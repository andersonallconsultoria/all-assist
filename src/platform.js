import { CissClient } from "./cissClient.js";
import { ConversationService } from "./conversationService.js";
import { CrmDataStore } from "./crmDataStore.js";
import { AuthService } from "./authService.js";
import { AlertService } from "./alertService.js";
import { AccessRoleService } from "./accessRoleService.js";
import { CommercialStructureService } from "./commercialStructureService.js";
import { LocalCissSyncService } from "./localCissSyncService.js";
import { LocalCrmService } from "./localCrmService.js";
import { IntegrationScheduleService } from "./integrationScheduleService.js";
import { createLogger } from "./logger.js";
import { ErpIntegrationService } from "./erpIntegrationService.js";
import { ObservabilityService } from "./observabilityService.js";
import { loadPlatformConfig } from "./platformConfig.js";
import { startPlatformServer } from "./platformServer.js";
import { TenantService } from "./tenantService.js";
import { UserOnboardingService } from "./userOnboardingService.js";
import { WhatsAppMetaClient } from "./whatsappMetaClient.js";
import { EvolutionInstanceService } from "./evolutionInstanceService.js";
import { DealExpiryService } from "./dealExpiryService.js";

async function main() {
  const config = loadPlatformConfig();
  const logger = createLogger({
    level: config.logLevel,
    file: config.logFile
  });

  const store = new CrmDataStore(config.crmDataFile);
  store.load();
  const alertService = new AlertService(config, logger);

  const authService = new AuthService(store, config, logger);
  authService.bootstrap();

  const erpIntegrationService = new ErpIntegrationService(store, config, logger);
  bootstrapSeedErpSettings(store, config, erpIntegrationService, logger);
  erpIntegrationService.applyStoredSettings();

  const crmService = new LocalCrmService(store, config, logger);
  const observabilityService = new ObservabilityService(store, config, logger);
  const tenantService = new TenantService(store, logger);
  const commercialStructureService = new CommercialStructureService(store, logger);
  const accessRoleService = new AccessRoleService(store, logger);
  const userOnboardingService = new UserOnboardingService(store, authService, config, logger);
  const integrationScheduleService = new IntegrationScheduleService(store, logger);
  const whatsappClient = new WhatsAppMetaClient(config, logger);
  const evolutionInstanceService = new EvolutionInstanceService(store, logger);
  const conversationService = new ConversationService(store, crmService, whatsappClient, logger, evolutionInstanceService);
  const localSyncService = new LocalCissSyncService({
    config,
    logger,
    cissClient: new CissClient(config, logger),
    crmService,
    observabilityService,
    store
  });

  if (config.syncOnce) {
    await localSyncService.runOnce();
    process.exit(0);
  }

  startPlatformServer({
    config,
    logger,
    store,
    crmService,
    conversationService,
    localSyncService,
    whatsappClient,
    authService,
    erpIntegrationService,
    observabilityService,
    tenantService,
    commercialStructureService,
    accessRoleService,
    userOnboardingService,
    integrationScheduleService,
    alertService,
    evolutionInstanceService
  });

  const dealExpiryService = new DealExpiryService({ store, crmService, logger });

  if (!config.disableScheduler) {
    await safeSync(localSyncService, logger, alertService, config);
    dealExpiryService.runOnce();
    setInterval(() => safeSync(localSyncService, logger, alertService, config), config.pollIntervalMs);
    setInterval(() => dealExpiryService.runOnce(), config.pollIntervalMs);
  }
}

function bootstrapSeedErpSettings(store, config, erpIntegrationService, logger) {
  const seeds = config.seedTenants || [];
  for (const seed of seeds) {
    if (!seed.slug || !seed.erp) continue;
    const tenant = store.findOne("tenants", (t) => t.slug === seed.slug);
    if (!tenant) continue;
    const existing = store.findOne("integrationSettings", (s) => s.tenantId === tenant.id);
    if (!existing) {
      erpIntegrationService.updateSettings(seed.erp, { tenantId: tenant.id });
      logger.warn("auth_bootstrap_seed_erp_created", { slug: seed.slug, tenantId: tenant.id });
    }
  }
}

async function safeSync(localSyncService, logger, alertService, config) {
  try {
    await localSyncService.runOnce();
  } catch (error) {
    logger.error("local_crm_sync_unhandled_error", {
      error: error.message,
      stack: error.stack
    });
    if (config.alerts.notifyIntegrationFailures) {
      await alertService.notifyError({
        title: "Falha na sincronizacao ERP",
        message: error.message,
        metadata: {
          service: "scheduler",
          stack: String(error.stack || "").slice(0, 500)
        }
      });
    }
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    ts: new Date().toISOString(),
    level: "error",
    event: "platform_boot_failed",
    error: error.message,
    stack: error.stack
  }));
  process.exit(1);
});
