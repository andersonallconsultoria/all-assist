import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { StateStore } from "../src/stateStore.js";
import { SyncService } from "../src/syncService.js";

const baseRecord = {
  idempresa: 1,
  idorcamento: 98438,
  dtmovimento: "2026-01-17",
  valtotliquido: 686,
  idclifor: 1886,
  nome: "INPRECOL INDUSTRIA PREMOLDADO",
  descrcidade: "UBERABA",
  uf: "MG",
  cnpjcpf: "12431662000103",
  fone1: "3433142366  46999812497",
  fonecelular: "46999812497",
  flagaprovado: "F",
  dtvalidade: "2026-04-27",
  status: "PENDENTE",
  statusgestao: "P",
  vendedores: "2 - VENDEDOR EXEMPLO"
};

test("SyncService creates a CRM lead, updates the order and stores state", async () => {
  const { service, crmClient, stateStore } = createService({
    cissPages: [
      {
        data: [baseRecord],
        total: 1,
        hasNext: false
      }
    ],
    crmOrdersByPhone: {
      "46999812497": [{ id: 3482001, createdAt: "2026-04-21T00:00:00.000Z" }]
    }
  });

  const stats = await service.runOnce();

  assert.deepEqual(stats, {
    fetched: 1,
    synced: 1,
    skipped: 0,
    failed: 0
  });
  assert.equal(crmClient.webhookPayloads.length, 1);
  assert.equal(crmClient.updateCalls.length, 1);
  assert.equal(crmClient.updateCalls[0].identifier, 3482001);
  assert.deepEqual(crmClient.updateCalls[0].payload, {
    amount: 686,
    step: "Entrada"
  });
  assert.equal(stateStore.get("1:98438").crmOrderId, 3482001);
});

test("SyncService skips unchanged records using the stored hash", async () => {
  const setup = createService({
    cissPages: [
      {
        data: [baseRecord],
        total: 1,
        hasNext: false
      }
    ],
    crmOrdersByPhone: {
      "46999812497": [{ id: 3482001, createdAt: "2026-04-21T00:00:00.000Z" }]
    }
  });

  await setup.service.runOnce();
  const stats = await setup.service.runOnce();

  assert.equal(stats.skipped, 1);
  assert.equal(setup.crmClient.webhookPayloads.length, 1);
  assert.equal(setup.crmClient.updateCalls.length, 1);
});

test("SyncService blocks same-phone orders before calling the webhook when a prior order is known", async () => {
  const secondRecord = {
    ...baseRecord,
    idorcamento: 98439,
    valtotliquido: 600
  };

  const { service, crmClient, stateStore } = createService({
    cissPages: [
      {
        data: [secondRecord],
        total: 1,
        hasNext: false
      }
    ],
    crmOrdersByPhone: {
      "46999812497": [{ id: 3482001, createdAt: "2026-04-21T00:00:00.000Z" }]
    }
  });

  stateStore.set("1:98438", {
    hash: "previous",
    phone: "46999812497",
    crmOrderId: 3482001,
    contactId: 9420001
  });

  const stats = await service.runOnce();

  assert.equal(stats.failed, 1);
  assert.equal(crmClient.webhookPayloads.length, 0);
  assert.equal(crmClient.updateCalls.length, 0);
  assert.equal(stateStore.get("1:98439"), null);
});

test("SyncService blocks a different CISS order that reuses the same CRM order id when same-phone precheck is disabled", async () => {
  const secondRecord = {
    ...baseRecord,
    idorcamento: 98439,
    valtotliquido: 600
  };

  const { service, crmClient, stateStore } = createService({
    failOnReusedOrderId: false,
    cissPages: [
      {
        data: [secondRecord],
        total: 1,
        hasNext: false
      }
    ],
    crmOrdersByPhone: {
      "46999812497": [{ id: 3482001, createdAt: "2026-04-21T00:00:00.000Z" }]
    }
  });

  service.config.crm.failOnReusedOrderId = true;
  stateStore.findSourceKeysByPhone = () => [];
  stateStore.set("1:98438", {
    hash: "previous",
    phone: "46999812497",
    crmOrderId: 3482001,
    contactId: 9420001
  });

  const stats = await service.runOnce();

  assert.equal(stats.failed, 1);
  assert.equal(crmClient.webhookPayloads.length, 1);
  assert.equal(crmClient.updateCalls.length, 0);
  assert.equal(stateStore.get("1:98439"), null);
});

test("SyncService allows same-phone orders when reuse protection is disabled", async () => {
  const secondRecord = {
    ...baseRecord,
    idorcamento: 98439,
    valtotliquido: 600
  };

  const { service, crmClient, stateStore } = createService({
    failOnReusedOrderId: false,
    cissPages: [
      {
        data: [secondRecord],
        total: 1,
        hasNext: false
      }
    ],
    crmOrdersByPhone: {
      "46999812497": [{ id: 3482002, createdAt: "2026-04-21T00:00:00.000Z" }]
    }
  });

  stateStore.set("1:98438", {
    hash: "previous",
    phone: "46999812497",
    crmOrderId: 3482001,
    contactId: 9420001
  });

  const stats = await service.runOnce();

  assert.equal(stats.synced, 1);
  assert.equal(crmClient.webhookPayloads.length, 1);
  assert.equal(crmClient.updateCalls.length, 1);
});

test("SyncService dry-run does not persist state or call CRM", async () => {
  const { service, crmClient, stateStore } = createService({
    dryRun: true,
    cissPages: [
      {
        data: [baseRecord],
        total: 1,
        hasNext: false
      }
    ],
    crmOrdersByPhone: {
      "46999812497": [{ id: 3482001, createdAt: "2026-04-21T00:00:00.000Z" }]
    }
  });

  const stats = await service.runOnce();

  assert.equal(stats.synced, 1);
  assert.equal(crmClient.webhookPayloads.length, 0);
  assert.equal(crmClient.updateCalls.length, 0);
  assert.equal(stateStore.get("1:98438"), null);
});

function createService({ cissPages, crmOrdersByPhone, dryRun = false, failOnReusedOrderId = true }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ciss-dkw-sync-"));
  const stateStore = new StateStore(path.join(dir, "state.json"));
  stateStore.load();

  const config = {
    dryRun,
    forceResync: false,
    ciss: {
      dtIni: "2025-07-01",
      dtFim: "2026-08-01",
      lookbackDays: 30,
      lookaheadDays: 180
    },
    crm: {
      defaultStep: "Entrada",
      defaultResponsible: "",
      stageMap: {
        PENDENTE: "Entrada",
        EFETIVADO: "Venda efetivada"
      },
      sendContactFields: true,
      sendOrderCustomFields: false,
      failOnReusedOrderId
    }
  };

  const cissClient = new FakeCissClient(cissPages);
  const crmClient = new FakeCrmClient(crmOrdersByPhone);
  const logger = createSilentLogger();

  return {
    service: new SyncService({
      config,
      logger,
      cissClient,
      crmClient,
      stateStore
    }),
    cissClient,
    crmClient,
    stateStore
  };
}

class FakeCissClient {
  constructor(pages) {
    this.pages = pages;
    this.authCount = 0;
  }

  async authenticate() {
    this.authCount += 1;
  }

  async fetchSalesManagementPage({ page }) {
    return this.pages[page - 1] || {
      data: [],
      total: 0,
      hasNext: false
    };
  }
}

class FakeCrmClient {
  constructor(ordersByPhone) {
    this.ordersByPhone = ordersByPhone;
    this.webhookPayloads = [];
    this.updateCalls = [];
  }

  async sendLeadWebhook(payload) {
    this.webhookPayloads.push(payload);
    return {
      id: 9420001
    };
  }

  async listCommercialOrdersByPhone(phone) {
    return this.ordersByPhone[phone] || [];
  }

  async updateCommercialOrder(identifier, payload) {
    this.updateCalls.push({ identifier, payload });
    return {
      id: identifier,
      contactId: 9420001,
      orderCustomFields: []
    };
  }
}

function createSilentLogger() {
  return {
    debug() {},
    info() {},
    warn() {},
    error() {}
  };
}
