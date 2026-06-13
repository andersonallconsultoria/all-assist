import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ConversationService, extractMessageEvents } from "../src/conversationService.js";
import { CrmDataStore } from "../src/crmDataStore.js";

const metaPayload = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "123",
      changes: [
        {
          field: "messages",
          value: {
            metadata: {
              phone_number_id: "987"
            },
            contacts: [
              {
                profile: {
                  name: "Cliente Teste"
                },
                wa_id: "5546999990000"
              }
            ],
            messages: [
              {
                from: "5546999990000",
                id: "wamid.TEST",
                timestamp: "1776770000",
                type: "text",
                text: {
                  body: "Quero saber do meu orcamento"
                }
              }
            ]
          }
        }
      ]
    }
  ]
};

test("extractMessageEvents reads Meta WhatsApp text messages", () => {
  const events = extractMessageEvents(metaPayload);
  assert.equal(events.length, 1);
  assert.equal(events[0].from, "5546999990000");
  assert.equal(events[0].body, "Quero saber do meu orcamento");
  assert.equal(events[0].profileName, "Cliente Teste");
});

test("ConversationService creates contact, conversation and inbound message", () => {
  const store = createStore();
  const service = new ConversationService(store, {}, fakeWhatsappClient(), silentLogger());

  const saved = service.receiveMetaWebhook(metaPayload);

  assert.equal(saved.length, 1);
  assert.equal(store.list("contacts").length, 1);
  assert.equal(store.list("conversations").length, 1);
  assert.equal(store.list("messages").length, 1);
  assert.equal(store.list("messages")[0].body, "Quero saber do meu orcamento");
});

test("ConversationService queues outbound message when Meta is not configured", async () => {
  const store = createStore();
  const service = new ConversationService(store, {}, fakeWhatsappClient(), silentLogger());
  const [{ conversation }] = service.receiveMetaWebhook(metaPayload);

  const message = await service.sendText(conversation.id, "Vou verificar e te retorno.");

  assert.equal(message.direction, "outbound");
  assert.equal(message.status, "queued");
  assert.equal(store.list("messages").length, 2);
});

function createStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "crm-store-"));
  const store = new CrmDataStore(path.join(dir, "crm.json"));
  store.load();
  return store;
}

function fakeWhatsappClient() {
  return {
    isConfigured: () => false,
    sendText: async () => null
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
