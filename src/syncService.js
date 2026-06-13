import { buildCissDateRange } from "./dateRange.js";
import { findLatestCommercialOrder } from "./crmClient.js";
import {
  buildLeadPayload,
  buildOrderUpdatePayload,
  extractPhone,
  getSourceKey,
  getStatusKey,
  hashRecord
} from "./mapper.js";

export class SyncService {
  constructor({ config, logger, cissClient, crmClient, stateStore }) {
    this.config = config;
    this.logger = logger;
    this.cissClient = cissClient;
    this.crmClient = crmClient;
    this.stateStore = stateStore;
  }

  async runOnce() {
    const runId = cryptoRandomId();
    const range = buildCissDateRange(this.config);
    const stats = {
      fetched: 0,
      synced: 0,
      skipped: 0,
      failed: 0
    };

    this.logger.info("sync_run_start", {
      runId,
      dtIni: range.dtIni,
      dtFim: range.dtFim,
      dryRun: this.config.dryRun
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

      this.logger.info("ciss_page_fetched", {
        runId,
        page,
        records: response.data.length,
        total: response.total,
        hasNext
      });

      for (const record of response.data) {
        const result = await this.syncRecord(record, runId);
        stats[result] = (stats[result] || 0) + 1;

        if (!this.config.dryRun && result === "synced") {
          this.stateStore.save();
        }
      }

      page += 1;
    } while (hasNext);

    if (!this.config.dryRun) {
      this.stateStore.save();
    }
    this.logger.info("sync_run_finished", { runId, ...stats });
    return stats;
  }

  async syncRecord(record, runId) {
    const sourceKey = getSourceKey(record);
    const phone = extractPhone(record);
    const nextHash = hashRecord(record);
    const previous = this.stateStore.get(sourceKey);

    if (!phone) {
      this.logger.warn("ciss_order_skipped_no_phone", {
        runId,
        sourceKey,
        idorcamento: record.idorcamento,
        idclifor: record.idclifor,
        nome: record.nome
      });
      return "skipped";
    }

    if (!this.config.forceResync && previous?.hash === nextHash) {
      this.logger.debug("ciss_order_skipped_unchanged", {
        runId,
        sourceKey,
        phone,
        crmOrderId: previous.crmOrderId
      });
      return "skipped";
    }

    try {
      const hasCrmOrder = Boolean(previous?.crmOrderId);
      this.logger.info("ciss_order_sync_start", {
        runId,
        sourceKey,
        phone,
        action: hasCrmOrder ? "update" : "create",
        statusKey: getStatusKey(record)
      });

      let crmOrderId = previous?.crmOrderId || null;
      let contactId = previous?.contactId || null;

      if (!hasCrmOrder) {
        const samePhoneSourceKeys = this.stateStore.findSourceKeysByPhone(phone, sourceKey);
        if (this.config.crm.failOnReusedOrderId && samePhoneSourceKeys.length) {
          const error = new Error(`Phone ${phone} is already linked to another CISS order and CRM multi-order support is not confirmed`);
          error.reuseDetails = {
            runId,
            sourceKey,
            phone,
            reusedBy: samePhoneSourceKeys
          };
          throw error;
        }

        const leadPayload = buildLeadPayload(record, this.config);

        if (this.config.dryRun) {
          this.logger.info("dry_run_crm_webhook_skipped", { runId, sourceKey, leadPayload });
        } else {
          const webhookResponse = await this.crmClient.sendLeadWebhook(leadPayload);
          contactId = webhookResponse?.id || webhookResponse?.contact?.id || contactId;
          this.logger.info("crm_webhook_sent", { runId, sourceKey, phone, contactId });
        }

        if (!this.config.dryRun) {
          const orders = await this.crmClient.listCommercialOrdersByPhone(phone);
          const latestOrder = findLatestCommercialOrder(orders);
          crmOrderId = latestOrder?.id || null;

          if (!crmOrderId) {
            throw new Error(`CRM business was not found after webhook for phone ${phone}`);
          }

          const reusedBy = this.stateStore.findSourceKeysByCrmOrderId(crmOrderId, sourceKey);
          if (reusedBy.length) {
            const reuseDetails = {
              runId,
              sourceKey,
              crmOrderId,
              reusedBy
            };
            this.logger.warn("crm_order_reused_for_multiple_ciss_orders", reuseDetails);

            if (this.config.crm.failOnReusedOrderId) {
              const error = new Error(`CRM order ${crmOrderId} is already linked to another CISS order`);
              error.reuseDetails = reuseDetails;
              throw error;
            }
          }
        }
      }

      const updatePayload = buildOrderUpdatePayload(record, this.config);
      if (this.config.dryRun) {
        this.logger.info("dry_run_crm_order_update_skipped", {
          runId,
          sourceKey,
          identifier: crmOrderId || phone,
          updatePayload
        });
        this.logger.info("ciss_order_sync_success", {
          runId,
          sourceKey,
          phone,
          dryRun: true
        });
        return "synced";
      } else {
        const updated = await this.crmClient.updateCommercialOrder(crmOrderId || phone, updatePayload);
        crmOrderId = updated?.id || crmOrderId;
        contactId = updated?.contactId || updated?.contact?.id || contactId;

        if (Array.isArray(updated?.orderCustomFields) && updated.orderCustomFields.length === 0 && this.config.crm.sendOrderCustomFields) {
          this.logger.warn("crm_order_custom_fields_empty_after_update", {
            runId,
            sourceKey,
            crmOrderId
          });
        }
      }

      this.stateStore.set(sourceKey, {
        sourceKey,
        hash: nextHash,
        phone,
        contactId,
        crmOrderId,
        amount: Number(record.valtotliquido || 0),
        statusKey: getStatusKey(record),
        lastSyncedAt: new Date().toISOString()
      });

      this.logger.info("ciss_order_sync_success", {
        runId,
        sourceKey,
        phone,
        contactId,
        crmOrderId
      });

      return "synced";
    } catch (error) {
      this.logger.error("ciss_order_sync_failed", {
        runId,
        sourceKey,
        phone,
        error: error.message,
        reuseDetails: error.reuseDetails,
        response: error.response,
        status: error.status,
        body: error.body
      });
      return "failed";
    }
  }
}

function cryptoRandomId() {
  return Math.random().toString(36).slice(2, 10);
}
