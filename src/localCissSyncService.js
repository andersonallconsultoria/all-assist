import { buildCissDateRange } from "./dateRange.js";
import { extractPhone, getSourceKey, hashRecord } from "./mapper.js";

export class LocalCissSyncService {
  constructor({ config, logger, cissClient, crmService, observabilityService, store }) {
    this.config = config;
    this.logger = logger;
    this.cissClient = cissClient;
    this.crmService = crmService;
    this.store = store;
    this.observabilityService = observabilityService;
  }

  async runOnce({ tenantId = defaultTenantId(this.store) } = {}) {
    const runId = createRunId();
    const range = buildCissDateRange(this.config);
    const stats = {
      fetched: 0,
      upserted: 0,
      skipped: 0,
      failed: 0
    };

    this.logger.info("local_crm_sync_start", {
      runId,
      tenantId,
      dtIni: range.dtIni,
      dtFim: range.dtFim,
      dryRun: this.config.dryRun
    });
    this.recordIntegrationEvent({
      runId,
      tenantId,
      status: "started",
      action: "sync_started",
      message: "Sincronizacao ERP iniciada",
      metadata: {
        range,
        dryRun: this.config.dryRun
      }
    });

    await this.cissClient.authenticate();

    let page = 1;
    let hasNext = false;

    do {
      const response = await this.cissClient.fetchSalesManagementPage({
        page,
        dtIni: range.dtIni,
        dtFim: range.dtFim
      });

      stats.fetched += response.data.length;
      hasNext = response.hasNext;

      for (const record of response.data) {
        const result = await this.syncRecord(record, runId, tenantId);
        stats[result] = (stats[result] || 0) + 1;
      }

      page += 1;
    } while (hasNext);

    this.store.insert("syncRuns", {
      runId,
      tenantId,
      provider: "erp",
      stats,
      range
    });
    this.recordIntegrationEvent({
      runId,
      tenantId,
      status: stats.failed ? "warning" : "success",
      action: "sync_finished",
      message: "Sincronizacao ERP finalizada",
      metadata: {
        stats,
        range
      }
    });
    this.store.save();

    this.logger.info("local_crm_sync_finished", { runId, ...stats });
    return stats;
  }

  async syncRecord(record, runId, tenantId = defaultTenantId(this.store)) {
    const sourceKey = getSourceKey(record);
    const phone = extractPhone(record);
    const nextHash = hashRecord(record);
    const startedAt = Date.now();

    if (!phone) {
      this.logger.warn("local_crm_sync_skipped_no_phone", {
        runId,
        sourceKey,
        idorcamento: record.idorcamento,
        nome: record.nome
      });
      this.recordIntegrationEvent({
        runId,
        tenantId,
        sourceKey,
        status: "skipped",
        action: "record_skipped_no_phone",
        message: "Registro ignorado porque nao possui telefone valido",
        durationMs: Date.now() - startedAt,
        metadata: {
          idorcamento: record.idorcamento,
          nome: record.nome
        }
      });
      return "skipped";
    }

    const existingDeal = this.store.findOne("deals", (deal) => deal.tenantId === tenantId && deal.externalKey === sourceKey);
    const erpSeller = String(record.vendedores || "").trim();
    const crmSeller = String(existingDeal?.assignedSeller || "").trim();
    const sellerDiverged = existingDeal && erpSeller !== crmSeller;
    if (!this.config.forceResync && existingDeal?.sourceHash === nextHash && existingDeal.sourceRecord && !sellerDiverged) {
      this.recordIntegrationEvent({
        runId,
        tenantId,
        sourceKey,
        status: "skipped",
        action: "record_skipped_unchanged",
        message: "Registro ignorado porque nao teve alteracao desde a ultima sincronizacao",
        durationMs: Date.now() - startedAt,
        metadata: {
          idorcamento: record.idorcamento,
          phone
        }
      });
      return "skipped";
    }

    try {
      if (this.config.dryRun) {
        this.logger.info("dry_run_local_crm_upsert_skipped", {
          runId,
          sourceKey,
          phone,
          idorcamento: record.idorcamento
        });
        this.recordIntegrationEvent({
          runId,
          tenantId,
          sourceKey,
          status: "dry_run",
          action: "record_dry_run",
          message: "Registro validado em dry-run sem gravacao",
          durationMs: Date.now() - startedAt,
          metadata: {
            idorcamento: record.idorcamento,
            phone
          }
        });
        return "upserted";
      }

      const { contact, deal } = this.crmService.upsertDealFromCiss(record, tenantId);
      this.store.update("deals", deal.id, {
        sourceHash: nextHash,
        lastSyncedAt: new Date().toISOString()
      });
      this.store.save();

      this.logger.info("local_crm_order_upserted", {
        runId,
        sourceKey,
        contactId: contact.id,
        dealId: deal.id,
        phone
      });
      this.recordIntegrationEvent({
        runId,
        tenantId,
        sourceKey,
        status: "success",
        action: existingDeal ? "record_updated" : "record_created",
        message: existingDeal ? "Pedido atualizado no Neurax CRM" : "Pedido criado no Neurax CRM",
        durationMs: Date.now() - startedAt,
        metadata: {
          contactId: contact.id,
          dealId: deal.id,
          idorcamento: record.idorcamento,
          phone
        }
      });

      return "upserted";
    } catch (error) {
      this.logger.error("local_crm_sync_failed", {
        runId,
        sourceKey,
        phone,
        error: error.message,
        stack: error.stack
      });
      this.recordIntegrationEvent({
        runId,
        tenantId,
        sourceKey,
        status: "failed",
        action: "record_failed",
        message: "Falha ao sincronizar registro do ERP",
        durationMs: Date.now() - startedAt,
        error: error.message,
        metadata: {
          idorcamento: record.idorcamento,
          phone
        }
      });
      return "failed";
    }
  }

  recordIntegrationEvent(event) {
    if (this.observabilityService) {
      this.observabilityService.recordIntegrationEvent(event);
    }
  }
}

function createRunId() {
  return Math.random().toString(36).slice(2, 10);
}

function defaultTenantId(store) {
  return store.findOne("tenants", (tenant) => tenant.slug === "default")?.id || store.list("tenants")[0]?.id || "tenant_default";
}
