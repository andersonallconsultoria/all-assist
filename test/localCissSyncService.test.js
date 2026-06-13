import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { CrmDataStore } from "../src/crmDataStore.js";
import { LocalCissSyncService } from "../src/localCissSyncService.js";
import { LocalCrmService } from "../src/localCrmService.js";

const records = [
  {
    idempresa: 1,
    idorcamento: 98438,
    dtmovimento: "2026-01-17",
    valtotliquido: 686,
    idclifor: 1886,
    nome: "INPRECOL INDUSTRIA PREMOLDADO",
    descrcidade: "UBERABA",
    uf: "MG",
    cnpjcpf: "12431662000103",
    fonecelular: "46999812497",
    dtvalidade: "2026-04-27",
    desrdav: "PEDIDO",
    status: "PENDENTE",
    vendedores: "2 - VENDEDOR EXEMPLO"
  },
  {
    idempresa: 1,
    idorcamento: 98439,
    dtmovimento: "2026-01-22",
    valtotliquido: 600,
    idclifor: 1886,
    nome: "INPRECOL INDUSTRIA PREMOLDADO",
    descrcidade: "UBERABA",
    uf: "MG",
    cnpjcpf: "12431662000103",
    fonecelular: "46999812497",
    dtvalidade: "2026-05-02",
    desrdav: "PEDIDO",
    status: "PENDENTE",
    vendedores: "2 - VENDEDOR EXEMPLO"
  }
];

test("LocalCissSyncService creates one contact and separate deals per CISS order", async () => {
  const { store, service } = createService(records);

  const stats = await service.runOnce();

  assert.equal(stats.fetched, 2);
  assert.equal(stats.upserted, 2);
  assert.equal(store.list("contacts").length, 1);
  assert.equal(store.list("deals").length, 2);
  assert.deepEqual(
    store.list("deals").map((deal) => deal.externalKey).sort(),
    ["1:98438", "1:98439"]
  );
  assert.equal(store.list("deals")[0].sourceRecord.idorcamento, 98438);
});

test("LocalCissSyncService skips unchanged deals after first sync", async () => {
  const { store, service } = createService(records);

  await service.runOnce();
  const stats = await service.runOnce();

  assert.equal(stats.skipped, 2);
  assert.equal(store.list("deals").length, 2);
});

test("LocalCissSyncService routes quotes and orders to their pipelines", async () => {
  const { store, service } = createService([
    { ...records[0], idorcamento: 98440, desrdav: "ORCAMENTO" },
    { ...records[1], idorcamento: 98441, desrdav: "PEDIDO" }
  ]);

  await service.runOnce();

  const pipelines = store.list("pipelines");
  const quotePipeline = pipelines.find((pipeline) => pipeline.kind === "quote");
  const orderPipeline = pipelines.find((pipeline) => pipeline.kind === "order");
  const quoteDeal = store.findOne("deals", (deal) => deal.externalOrderId === "98440");
  const orderDeal = store.findOne("deals", (deal) => deal.externalOrderId === "98441");

  assert.equal(quoteDeal.pipelineId, quotePipeline.id);
  assert.equal(orderDeal.pipelineId, orderPipeline.id);
});

function createService(data) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "local-ciss-sync-"));
  const store = new CrmDataStore(path.join(dir, "crm.json"));
  store.load();

  const config = {
    dryRun: false,
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
        PENDENTE: "Entrada"
      }
    }
  };

  const crmService = new LocalCrmService(store, config, silentLogger());
  return {
    store,
    service: new LocalCissSyncService({
      config,
      logger: silentLogger(),
      cissClient: new FakeCissClient(data),
      crmService,
      store
    })
  };
}

class FakeCissClient {
  constructor(data) {
    this.data = data;
  }

  async authenticate() {}

  async fetchSalesManagementPage() {
    return {
      data: this.data,
      total: this.data.length,
      hasNext: false
    };
  }
}

function silentLogger() {
  return {
    debug() {},
    info() {},
    warn() {},
    error() {}
  };
}
