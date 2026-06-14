import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { CrmDataStore } from "../src/crmDataStore.js";
import { TicketService } from "../src/ticketService.js";

function createService() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ticket-svc-"));
  const store = new CrmDataStore(path.join(dir, "data.json"));
  store.load();
  const tenant = store.findOne("tenants", (t) => t.slug === "default") || store.insert("tenants", { name: "T", slug: "default", status: "active" });
  const contact = store.insert("contacts", { tenantId: tenant.id, name: "Cliente Teste", phone: "5534999990000" });
  const conversation = store.insert("conversations", { tenantId: tenant.id, contactId: contact.id, status: "open" });
  return { store, tenant, contact, conversation, service: new TicketService(store, silentLogger()) };
}

test("createTicket usa classificação da IA e calcula SLA", () => {
  const { service, tenant, contact, conversation } = createService();
  const ticket = service.createTicket({
    tenantId: tenant.id,
    contactId: contact.id,
    conversationId: conversation.id,
    firstMessage: "Minha entrega atrasou e estou muito insatisfeito",
    aiClassification: { category: "complaint", priority: "high", subject: "Atraso na entrega", confidence: 0.9 }
  });

  assert.match(ticket.id, /^tk_/);
  assert.equal(ticket.status, "open");
  assert.equal(ticket.category, "complaint");
  assert.equal(ticket.priority, "high");
  assert.equal(ticket.subject, "Atraso na entrega");
  assert.ok(ticket.slaDueAt);
  assert.equal(ticket.aiClassification.confidence, 0.9);
  assert.equal(ticket.logs.length, 1);
});

test("createTicket sem IA aplica defaults", () => {
  const { service, tenant, contact, conversation } = createService();
  const ticket = service.createTicket({
    tenantId: tenant.id,
    contactId: contact.id,
    conversationId: conversation.id,
    firstMessage: "Olá, preciso de ajuda"
  });
  assert.equal(ticket.priority, "medium");
  assert.equal(ticket.category, "support");
  assert.equal(ticket.aiClassification, null);
});

test("ciclo de vida: atribuir, mudar status e fechar", () => {
  const { service, store, tenant, contact, conversation } = createService();
  const analyst = store.insert("users", { tenantId: tenant.id, name: "Analista" });
  const ticket = service.createTicket({
    tenantId: tenant.id,
    contactId: contact.id,
    conversationId: conversation.id,
    firstMessage: "Dúvida sobre o produto"
  });

  const assigned = service.assignTicket(ticket.id, analyst.id, tenant.id, "us_mgr");
  assert.equal(assigned.assignedAnalystId, analyst.id);

  const waiting = service.setTicketStatus(ticket.id, tenant.id, "waiting_customer", analyst.id);
  assert.equal(waiting.status, "waiting_customer");
  assert.ok(store.findById("tickets", ticket.id).firstResponseAt, "firstResponseAt setado ao sair de open");

  const closed = service.closeTicket(ticket.id, tenant.id, "Resolvido", analyst.id);
  assert.equal(closed.status, "closed");
  assert.equal(closed.closedBy, analyst.id);
  assert.equal(closed.closureNote, "Resolvido");

  // Fechado não aparece em listOpenTickets
  assert.equal(service.listOpenTickets(tenant.id).length, 0);
});

test("listOpenTickets ordena por prioridade e respeita filtros/tenant", () => {
  const { service, store, tenant, contact, conversation } = createService();
  const other = store.insert("tenants", { name: "Outro", slug: "outro", status: "active" });
  service.createTicket({ tenantId: tenant.id, contactId: contact.id, conversationId: conversation.id, firstMessage: "a", aiClassification: { priority: "low", category: "support" } });
  service.createTicket({ tenantId: tenant.id, contactId: contact.id, conversationId: conversation.id, firstMessage: "b", aiClassification: { priority: "critical", category: "complaint" } });
  service.createTicket({ tenantId: other.id, contactId: contact.id, conversationId: conversation.id, firstMessage: "c" });

  const open = service.listOpenTickets(tenant.id);
  assert.equal(open.length, 2);
  assert.equal(open[0].priority, "critical", "crítico vem primeiro");

  const complaints = service.listOpenTickets(tenant.id, { category: "complaint" });
  assert.equal(complaints.length, 1);
});

test("operações rejeitam ticket de outro tenant", () => {
  const { service, store, tenant, contact, conversation } = createService();
  const other = store.insert("tenants", { name: "Outro", slug: "outro", status: "active" });
  const ticket = service.createTicket({ tenantId: tenant.id, contactId: contact.id, conversationId: conversation.id, firstMessage: "x" });
  assert.throws(() => service.closeTicket(ticket.id, other.id), /not found/i);
  assert.equal(service.getTicket(ticket.id, other.id), null);
});

test("cronômetro: start, pause consolida e fechar encerra o timer", () => {
  const { service, tenant, contact, conversation } = createService();
  const ticket = service.createTicket({ tenantId: tenant.id, contactId: contact.id, conversationId: conversation.id, firstMessage: "x" });
  assert.equal(ticket.timeTracking.status, "stopped");
  assert.equal(ticket.timeTracking.accumulatedSeconds, 0);

  const started = service.setTimer(ticket.id, tenant.id, "start");
  assert.equal(started.timeTracking.status, "running");
  assert.ok(started.timeTracking.lastStartedAt);

  const paused = service.setTimer(ticket.id, tenant.id, "pause");
  assert.equal(paused.timeTracking.status, "paused");
  assert.equal(paused.timeTracking.lastStartedAt, null);
  assert.ok(paused.timeTracking.accumulatedSeconds >= 0);

  service.setTimer(ticket.id, tenant.id, "start");
  const closed = service.closeTicket(ticket.id, tenant.id, "ok", "us_1");
  assert.equal(closed.timeTracking.status, "stopped", "fechar para o cronômetro");

  assert.throws(() => service.setTimer(ticket.id, tenant.id, "xyz"), /inválida/i);
});

function silentLogger() {
  return { debug() {}, info() {}, warn() {}, error() {} };
}
