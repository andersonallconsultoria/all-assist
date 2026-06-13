import { CissClient } from "./cissClient.js";
import { loadConfig } from "./config.js";
import { CrmClient } from "./crmClient.js";
import { startHealthServer } from "./healthServer.js";
import { createLogger } from "./logger.js";
import { StateStore } from "./stateStore.js";
import { SyncService } from "./syncService.js";

async function main() {
  const config = loadConfig();

  if (!config.crm.tlsRejectUnauthorized) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  }

  const logger = createLogger({
    level: config.logLevel,
    file: config.logFile
  });

  if (!config.crm.tlsRejectUnauthorized) {
    logger.warn("tls_verification_disabled", {
      message: "CRM_TLS_REJECT_UNAUTHORIZED=false should only be used while the CRM certificate issue exists"
    });
  }

  const stateStore = new StateStore(config.stateFile);
  stateStore.load();

  const service = new SyncService({
    config,
    logger,
    cissClient: new CissClient(config, logger),
    crmClient: new CrmClient(config, logger),
    stateStore
  });

  if (config.enableHealthServer) {
    startHealthServer(config, logger);
  }

  if (config.runOnce) {
    await service.runOnce();
    process.exit(0);
  }

  let running = false;

  async function tick() {
    if (running) {
      logger.warn("sync_tick_skipped_already_running");
      return;
    }

    running = true;
    try {
      await service.runOnce();
    } catch (error) {
      logger.error("sync_run_unhandled_error", {
        error: error.message,
        stack: error.stack
      });
    } finally {
      running = false;
    }
  }

  await tick();
  setInterval(tick, config.pollIntervalMs);
}

main().catch((error) => {
  console.error(JSON.stringify({
    ts: new Date().toISOString(),
    level: "error",
    event: "process_boot_failed",
    error: error.message,
    stack: error.stack
  }));
  process.exit(1);
});
