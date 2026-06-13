import { ConversationService } from "./conversationService.js";
import { CrmDataStore } from "./crmDataStore.js";
import { AuthService } from "./authService.js";
import { AlertService } from "./alertService.js";
import { AccessRoleService } from "./accessRoleService.js";
import { LocalCrmService } from "./localCrmService.js";
import { createLogger } from "./logger.js";
import { ObservabilityService } from "./observabilityService.js";
import { loadPlatformConfig } from "./platformConfig.js";
import { startPlatformServer } from "./platformServer.js";
import { TenantService } from "./tenantService.js";
import { UserOnboardingService } from "./userOnboardingService.js";
import { WhatsAppMetaClient } from "./whatsappMetaClient.js";
import { EvolutionInstanceService } from "./evolutionInstanceService.js";

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

  const crmService = new LocalCrmService(store, config, logger);
  const observabilityService = new ObservabilityService(store, config, logger);
  const tenantService = new TenantService(store, logger);
  const accessRoleService = new AccessRoleService(store, logger);
  const userOnboardingService = new UserOnboardingService(store, authService, config, logger);
  const whatsappClient = new WhatsAppMetaClient(config, logger);
  const evolutionInstanceService = new EvolutionInstanceService(store, logger);
  const conversationService = new ConversationService(store, crmService, whatsappClient, logger, evolutionInstanceService);

  if (config.syncOnce) {
    process.exit(0);
  }

  startPlatformServer({
    config,
    logger,
    store,
    crmService,
    conversationService,
    whatsappClient,
    authService,
    observabilityService,
    tenantService,
    accessRoleService,
    userOnboardingService,
    alertService,
    evolutionInstanceService
  });
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
