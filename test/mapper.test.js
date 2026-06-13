import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLeadPayload,
  buildOrderCustomFields,
  buildOrderUpdatePayload,
  extractPhone,
  getSourceKey,
  hashRecord,
  mapStep
} from "../src/mapper.js";

const config = {
  crm: {
    defaultStep: "Entrada",
    defaultResponsible: "",
    stageMap: {
      PENDENTE: "Entrada",
      EFETIVADO: "Venda efetivada"
    },
    sendContactFields: true,
    sendOrderCustomFields: false
  }
};

const sample = {
  idempresa: 1,
  idorcamento: 98438,
  valtotliquido: 686,
  idclifor: 1886,
  nome: "INPRECOL INDUSTRIA PREMOLDADO",
  descrcidade: "UBERABA",
  uf: "MG",
  cnpjcpf: "12431662000103",
  fone1: "3433142366  46999812497",
  fonecelular: "46999812497",
  status: "PENDENTE",
  statusgestao: "P",
  vendedores: "2 - VENDEDOR EXEMPLO"
};

test("extractPhone chooses the mobile number", () => {
  assert.equal(extractPhone(sample), "46999812497");
});

test("getSourceKey uses company and order", () => {
  assert.equal(getSourceKey(sample), "1:98438");
});

test("mapStep uses status map", () => {
  assert.equal(mapStep(sample, config), "Entrada");
  assert.equal(mapStep({ ...sample, status: "EFETIVADO" }, config), "Venda efetivada");
});

test("buildLeadPayload keeps order custom fields disabled by default", () => {
  const payload = buildLeadPayload(sample, config);
  assert.equal(payload.name, "INPRECOL INDUSTRIA PREMOLDADO");
  assert.equal(payload.phone, "46999812497");
  assert.equal(payload.cidade, "UBERABA");
  assert.equal(payload.numeroOrcamento, undefined);
});

test("buildLeadPayload can include order custom fields when enabled", () => {
  const payload = buildLeadPayload(sample, {
    ...config,
    crm: {
      ...config.crm,
      sendOrderCustomFields: true
    }
  });
  assert.equal(payload.numeroOrcamento, "98438");
  assert.equal(payload.valorPedido, "686");
});

test("buildOrderCustomFields maps CISS order fields", () => {
  const fields = buildOrderCustomFields(sample);
  assert.equal(fields.numeroOrcamento, "98438");
  assert.equal(fields.valorPedido, "686");
  assert.equal(fields.vendedorCiss, "2 - VENDEDOR EXEMPLO");
});

test("buildOrderUpdatePayload sends amount and step", () => {
  assert.deepEqual(buildOrderUpdatePayload(sample, config), {
    amount: 686,
    step: "Entrada"
  });
});

test("hashRecord changes when status changes", () => {
  assert.notEqual(hashRecord(sample), hashRecord({ ...sample, status: "EFETIVADO" }));
});
