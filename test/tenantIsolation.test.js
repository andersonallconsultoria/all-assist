import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { CrmDataStore } from "../src/crmDataStore.js";
import { TicketService } from "../src/ticketService.js";
import { assertTenantAccess, resolveTenantFromHost } from "../src/tenantContext.js";
import { TenantService } from "../src/tenantService.js";

test("TicketService isolates tickets by tenant", () => {
  const { store, ticketService } = createFixture();
  const tenantA = store.findOne("tenants", (tenant) => tenant.slug === "default");
  const tenantB = store.insert("tenants", {
    name: "Boa Vista Pisos",
    slug: "boavistapisos",
    status: "active",
    plan: "business"
  });

  const contactA = store.insert("contacts", { tenantId: tenantA.id, name: "Cliente A", phone: "5534999990001" });
  const contactB = store.insert("contacts", { tenantId: tenantB.id, name: "Cliente B", phone: "5534999990002" });
  const convA = store.insert("conversations", { tenantId: tenantA.id, contactId: contactA.id, status: "open" });
  const convB = store.insert("conversations", { tenantId: tenantB.id, contactId: contactB.id, status: "open" });

  ticketService.createTicket({ tenantId: tenantA.id, contactId: contactA.id, conversationId: convA.id, firstMessage: "Olá, preciso de suporte" });
  ticketService.createTicket({ tenantId: tenantB.id, contactId: contactB.id, conversationId: convB.id, firstMessage: "Tenho uma dúvida" });

  assert.equal(ticketService.listOpenTickets(tenantA.id).length, 1);
  assert.equal(ticketService.listOpenTickets(tenantB.id).length, 1);
  assert.equal(store.list("contacts").length, 2);
  assert.notEqual(
    ticketService.listOpenTickets(tenantA.id)[0].id,
    ticketService.listOpenTickets(tenantB.id)[0].id
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

  const result = resolveTenantFromHost("materiaislobato.*.allassist.com.br", store, {
    saas: {
      baseDomain: "*.allassist.com.br",
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
  return {
    store,
    ticketService: new TicketService(store, silentLogger())
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
