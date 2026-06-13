import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { CrmDataStore } from "../src/crmDataStore.js";
import { LocalCrmService } from "../src/localCrmService.js";
import { assertTenantAccess, resolveTenantFromHost } from "../src/tenantContext.js";
import { TenantService } from "../src/tenantService.js";

test("LocalCrmService isolates contacts and deals by tenant", () => {
  const { store, crmService } = createFixture();
  const tenantA = store.findOne("tenants", (tenant) => tenant.slug === "default");
  const tenantB = store.insert("tenants", {
    name: "Boa Vista Pisos",
    slug: "boavistapisos",
    status: "active",
    plan: "business"
  });

  crmService.upsertDealFromCiss(sampleRecord(98458, "PEDIDO"), tenantA.id);
  crmService.upsertDealFromCiss(sampleRecord(98458, "PEDIDO"), tenantB.id);

  assert.equal(crmService.listDeals({}, tenantA.id).length, 1);
  assert.equal(crmService.listDeals({}, tenantB.id).length, 1);
  assert.equal(store.list("contacts").length, 2);
  assert.notEqual(
    crmService.listDeals({}, tenantA.id)[0].id,
    crmService.listDeals({}, tenantB.id)[0].id
  );
});

test("TenantService creates clean SaaS slugs and rejects duplicates", () => {
  const { store } = createFixture();
  const service = new TenantService(store, silentLogger());

  const tenant = service.createTenant({ name: "Materiais Lobato Ltda" });

  assert.equal(tenant.slug, "materiais-lobato-ltda");
  assert.equal(tenant.userLimit, 3);
  assert.equal(tenant.billingStatus, "active");
  assert.equal(tenant.whatsapp.status, "not_configured");
  assert.equal(tenant.lgpd.consentRequired, true);
  assert.throws(
    () => service.createTenant({ name: "Outro", slug: "materiais-lobato-ltda" }),
    /Ja existe/
  );
});

test("TenantService stores billing, WhatsApp and LGPD controls", () => {
  const { store } = createFixture();
  const service = new TenantService(store, silentLogger());

  const tenant = service.createTenant({
    name: "Boa Vista Pisos",
    slug: "boavistapisos",
    billingStatus: "overdue",
    monthlyBasePrice: "299,90",
    pricePerUser: "49",
    userLimit: "8",
    whatsappPhoneNumber: "55951174938",
    whatsappPhoneNumberId: "123",
    dpoName: "Keite",
    dpoEmail: "lgpd@boavista.com.br"
  });

  assert.equal(tenant.billingStatus, "overdue");
  assert.equal(tenant.monthlyBasePrice, 299.9);
  assert.equal(tenant.pricePerUser, 49);
  assert.equal(tenant.userLimit, 8);
  assert.equal(tenant.whatsapp.phoneNumber, "55951174938");
  assert.equal(tenant.whatsapp.phoneNumberId, "123");
  assert.equal(tenant.lgpd.dpoEmail, "lgpd@boavista.com.br");
});

test("resolveTenantFromHost maps wildcard subdomain to tenant", () => {
  const { store } = createFixture();
  store.insert("tenants", {
    name: "Materiais Lobato",
    slug: "materiaislobato",
    status: "active",
    plan: "business"
  });

  const result = resolveTenantFromHost("materiaislobato.crm.neurax.com.br", store, {
    saas: {
      baseDomain: "crm.neurax.com.br",
      masterSubdomain: "admin"
    }
  });

  assert.equal(result.tenant.name, "Materiais Lobato");
  assert.equal(result.isMasterDomain, false);
});

test("assertTenantAccess blocks suspended tenants for regular users", () => {
  const tenant = {
    id: "tenant_blocked",
    status: "active",
    billingStatus: "suspended"
  };

  const result = assertTenantAccess(
    { id: "usr_1", tenantId: tenant.id, permissions: [] },
    { tenant, isMaster: false, isUnknownTenantHost: false, hostTenant: null }
  );

  assert.equal(result.ok, false);
  assert.equal(result.error, "tenant_blocked");
});

function createFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tenant-isolation-"));
  const store = new CrmDataStore(path.join(dir, "crm.json"));
  store.load();
  const config = {
    crm: {
      defaultStep: "Entrada",
      defaultResponsible: "",
      stageMap: {
        PENDENTE: "Entrada"
      }
    }
  };
  return {
    store,
    crmService: new LocalCrmService(store, config, silentLogger())
  };
}

function sampleRecord(idorcamento, desrdav) {
  return {
    idempresa: 1,
    idorcamento,
    dtmovimento: "2026-04-21",
    valtotliquido: 700,
    idclifor: 556,
    nome: "ANDERSON ABRAO",
    descrcidade: "UBERABA",
    uf: "MG",
    cnpjcpf: "00170736180",
    fonecelular: "34999812497",
    dtvalidade: "2026-07-30",
    desrdav,
    status: "PENDENTE",
    vendedores: "2 - VENDEDOR EXEMPLO"
  };
}

function silentLogger() {
  return {
    debug() {},
    info() {},
    warn() {},
    error() {}
  };
}
