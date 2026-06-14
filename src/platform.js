import path from "node:path";
import { ConversationService } from "./conversationService.js";
import { CrmDataStore } from "./crmDataStore.js";
import { AuthService } from "./authService.js";
import { AlertService } from "./alertService.js";
import { AccessRoleService } from "./accessRoleService.js";
import { TicketService } from "./ticketService.js";
import { VaultService } from "./vaultService.js";
import { FileStore } from "./fileStore.js";
import { ClassifierAgent } from "./agents/classifier.js";
import { AssistantAgent } from "./agents/assistant.js";
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

  const observabilityService = new ObservabilityService(store, config, logger);
  const tenantService = new TenantService(store, logger);
  const accessRoleService = new AccessRoleService(store, logger);
  const userOnboardingService = new UserOnboardingService(store, authService, config, logger);
  const whatsappClient = new WhatsAppMetaClient(config, logger);
  const evolutionInstanceService = new EvolutionInstanceService(store, logger);
  const conversationService = new ConversationService(store, whatsappClient, logger, evolutionInstanceService);
  const ticketService = new TicketService(store, logger);
  const vaultService = new VaultService(store, logger);
  const fileStore = new FileStore(path.join(path.dirname(config.crmDataFile || "data/crm.json"), "uploads"));
  const classifierAgent = new ClassifierAgent(config, logger);
  const assistantAgent = new AssistantAgent(config, logger);

  if (config.syncOnce) {
    process.exit(0);
  }

  startPlatformServer({
    config,
    logger,
    store,
    conversationService,
    whatsappClient,
    authService,
    observabilityService,
    tenantService,
    accessRoleService,
    userOnboardingService,
    alertService,
    evolutionInstanceService,
    ticketService,
    vaultService,
    fileStore,
    classifierAgent,
    assistantAgent
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
