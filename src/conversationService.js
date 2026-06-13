import { normalizeToE164 } from "./whatsappMetaClient.js";

const META_STATUS_MAP = { sent: "sent", delivered: "delivered", read: "read", failed: "failed" };
const EVO_STATUS_MAP = { 0: "failed", 1: "sending", 2: "sent", 3: "delivered", 4: "read", 5: "read" };
const MSG_STATUS_ORDER = ["sending", "queued", "sent", "delivered", "read"];

export class ConversationService {
  constructor(store, whatsappClient, logger, evolutionInstanceService = null) {
    this.store = store;
    this.whatsappClient = whatsappClient;
    this.logger = logger;
    this.evolutionInstanceService = evolutionInstanceService;
  }

  updateMessageStatus(providerMessageId, newStatus) {
    if (!providerMessageId) return null;
    const message = this.store.findOne("messages", (m) => m.providerMessageId === providerMessageId);
    if (!message) return null;
    const currentIdx = MSG_STATUS_ORDER.indexOf(message.status);
    const newIdx = MSG_STATUS_ORDER.indexOf(newStatus);
    if (newStatus === "failed" || newIdx > currentIdx) {
      return this.store.update("messages", message.id, { status: newStatus });
    }
    return message;
  }

  receiveMetaWebhook(payload, tenantId = defaultTenantId(this.store)) {
    const events = extractMessageEvents(payload);
    const saved = [];

    // Atualiza status de mensagens enviadas (sent/delivered/read/failed)
    for (const su of extractStatusEvents(payload)) {
      this.updateMessageStatus(su.messageId, su.status);
    }

    for (const event of events) {
      const contact = this.upsertContactFromWhatsApp(event, tenantId);
      const conversation = this.openConversation(contact, event);
      const message = this.store.insert("messages", {
        tenantId: contact.tenantId || defaultTenantId(this.store),
        conversationId: conversation.id,
        contactId: contact.id,
        direction: "inbound",
        channel: "whatsapp",
        providerMessageId: event.messageId,
        from: event.from,
        to: event.phoneNumberId || "",
        type: event.type,
        body: event.body,
        raw: event.raw,
        status: "received",
        timestamp: event.timestamp
      });

      this.store.update("conversations", conversation.id, {
        lastMessageAt: message.createdAt,
        lastMessagePreview: message.body,
        unreadCount: Number(conversation.unreadCount || 0) + 1,
        status: "waiting"
      });

      saved.push({ contact, conversation, message });
    }

    return saved;
  }

  async sendText(conversationId, body, actor = "user", tenantId = "", senderUserId = null) {
    const conversation = this.store.findById("conversations", conversationId);
    if (!conversation) throw new Error("Conversation not found");
    if (tenantId && conversation.tenantId !== tenantId) throw new Error("Conversation not found");

    const contact = this.store.findById("contacts", conversation.contactId);
    if (!contact) throw new Error("Conversation contact not found");

    const provider = conversation.provider || "meta";
    let providerResponse = null;
    let status = "queued";

    if (provider === "evolution" && this.evolutionInstanceService) {
      const effectiveTenantId = conversation.tenantId || tenantId;
      const instance = (senderUserId && this.evolutionInstanceService.getByUser(effectiveTenantId, senderUserId))
        || this.evolutionInstanceService.getByTenant(effectiveTenantId);
      if (!instance || instance.status !== "connected") {
        throw new Error("WhatsApp Chat não está conectado. Reconecte o número nas configurações.");
      }
      const { EvolutionApiClient } = await import("./evolutionApiClient.js");
      const evoClient = new EvolutionApiClient(instance.apiUrl, instance.apiKey);

      // Anti-ban: verifica opt-out
      if (this.evolutionInstanceService.isOptedOut(instance, contact.phone)) {
        throw new Error("Este contato optou por não receber mensagens (opt-out registrado).");
      }

      // Anti-ban: verifica limites
      const check = this.evolutionInstanceService.canSend(instance);
      if (!check.allowed) throw new Error(`Envio bloqueado: ${check.reason}`);

      // Anti-ban: delay aleatório como indicador de digitação via Evolution API
      const delayMs = this.evolutionInstanceService.randomDelay(instance);
      providerResponse = await evoClient.sendText(instance.instanceName, contact.phone, body, delayMs);
      this.evolutionInstanceService.recordSent(instance.id);
      status = "sent";
    } else if (provider === "meta" && this.whatsappClient.isConfigured()) {
      providerResponse = await this.whatsappClient.sendText({ to: contact.phone, body });
      status = "sent";
    }

    const message = this.store.insert("messages", {
      tenantId: conversation.tenantId || defaultTenantId(this.store),
      conversationId,
      contactId: contact.id,
      direction: "outbound",
      channel: "whatsapp",
      provider,
      providerMessageId: providerResponse?.messages?.[0]?.id || providerResponse?.key?.id || "",
      from: "crm",
      to: normalizeToE164(contact.phone),
      type: "text",
      body,
      raw: providerResponse || {},
      status,
      actor
    });

    this.store.update("conversations", conversation.id, {
      lastMessageAt: message.createdAt,
      lastMessagePreview: message.body,
      status: "open"
    });

    return message;
  }

  receiveEvolutionWebhook(payload, tenantId) {
    const event = payload?.event;
    const instanceName = payload?.instance;

    if (event === "messages.update") {
      const updates = Array.isArray(payload?.data) ? payload.data : [payload?.data].filter(Boolean);
      for (const upd of updates) {
        if (!upd?.key?.fromMe) continue;
        const providerId = upd.key?.id;
        const status = EVO_STATUS_MAP[upd.update?.status] || null;
        if (providerId && status) this.updateMessageStatus(providerId, status);
      }
      this.store.save();
      return { type: "status_update" };
    }

    if (event === "messages.upsert") {
      const data = payload?.data;
      if (!data || data?.key?.fromMe) return null; // ignora mensagens enviadas por nós

      const remoteJid = data.key?.remoteJid || "";
      const phone = remoteJid.replace("@s.whatsapp.net", "").replace("@c.us", "");
      if (!phone) return null;

      const body = extractEvolutionBody(data);
      const profileName = data.pushName || phone;
      const timestamp = data.messageTimestamp
        ? new Date(Number(data.messageTimestamp) * 1000).toISOString()
        : new Date().toISOString();

      // Verifica opt-out
      if (this.evolutionInstanceService) {
        const instance = this.evolutionInstanceService.getByTenant(tenantId);
        if (instance && this.evolutionInstanceService.checkOptOutPhrase(body)) {
          this.evolutionInstanceService.addOptOut(instance.id, phone);
          this.logger.info("evolution_opt_out_detected", { tenantId, phone, body });
        }
      }

      const contact = this.upsertContactFromWhatsApp({ from: phone, profileName, body, timestamp }, tenantId);
      const conversation = this.openConversation(contact, { timestamp, body }, "evolution", payload._instanceId || null);

      const message = this.store.insert("messages", {
        tenantId,
        conversationId: conversation.id,
        contactId: contact.id,
        direction: "inbound",
        channel: "whatsapp",
        provider: "evolution",
        providerMessageId: data.key?.id || "",
        from: phone,
        to: instanceName || "",
        type: data.messageType || "text",
        body,
        raw: data,
        status: "received",
        timestamp
      });

      this.store.update("conversations", conversation.id, {
        lastMessageAt: message.createdAt,
        lastMessagePreview: message.body,
        unreadCount: Number(conversation.unreadCount || 0) + 1,
        status: "waiting"
      });

      return { contact, conversation, message };
    }

    return null;
  }

  listConversations(filters = {}, tenantId = "") {
    let conversations = this.store.list("conversations");
    if (tenantId) conversations = conversations.filter((conversation) => conversation.tenantId === tenantId);
    if (filters.status) conversations = conversations.filter((conversation) => conversation.status === filters.status);
    if (filters.q) {
      const q = filters.q.toLowerCase();
      conversations = conversations.filter((conversation) => `${conversation.contactName} ${conversation.contactPhone} ${conversation.lastMessagePreview}`.toLowerCase().includes(q));
    }
    return conversations.sort((a, b) => String(b.lastMessageAt || b.updatedAt).localeCompare(String(a.lastMessageAt || a.updatedAt)));
  }

  getConversation(id, tenantId = "") {
    const conversation = this.store.findById("conversations", id);
    if (!conversation) return null;
    if (tenantId && conversation.tenantId !== tenantId) return null;
    return {
      ...conversation,
      contact: this.store.findById("contacts", conversation.contactId),
      messages: this.store.list("messages").filter((message) => message.conversationId === id && (!tenantId || message.tenantId === tenantId))
    };
  }

  upsertContactFromWhatsApp(event, tenantId = defaultTenantId(this.store)) {
    const phone = normalizeToE164(event.from).replace(/^55/, "");
    let contact = this.store.findOne("contacts", (item) => (
      item.tenantId === tenantId && normalizeToE164(item.phone) === normalizeToE164(event.from)
    ));
    const patch = {
      tenantId: contact?.tenantId || tenantId,
      name: event.profileName || contact?.name || event.from,
      phone,
      source: "whatsapp",
      lastSeenAt: new Date().toISOString()
    };

    if (contact) return this.store.update("contacts", contact.id, patch);
    return this.store.insert("contacts", patch);
  }

  openConversation(contact, event, provider = "meta", instanceId = null) {
    const existing = this.store.findOne("conversations", (conversation) => (
      conversation.contactId === contact.id &&
      conversation.status !== "closed" &&
      (conversation.provider || "meta") === provider &&
      (!instanceId || conversation.instanceId === instanceId)
    ));
    if (existing) return existing;

    return this.store.insert("conversations", {
      tenantId: contact.tenantId || defaultTenantId(this.store),
      contactId: contact.id,
      contactName: contact.name,
      contactPhone: contact.phone,
      channel: "whatsapp",
      provider,
      instanceId,
      status: "waiting",
      assignedTo: "",
      department: "",
      tags: [],
      unreadCount: 0,
      lastMessageAt: event.timestamp,
      lastMessagePreview: event.body
    });
  }
}

function defaultTenantId(store) {
  return store.list("tenants")[0]?.id || "tenant_default";
}

export function extractStatusEvents(payload) {
  const statuses = [];
  for (const entry of payload?.entry || []) {
    for (const change of entry.changes || []) {
      for (const s of change.value?.statuses || []) {
        const status = META_STATUS_MAP[s.status];
        if (status) statuses.push({ messageId: s.id, status });
      }
    }
  }
  return statuses;
}

export function extractMessageEvents(payload) {
  const entries = payload?.entry || [];
  const events = [];

  for (const entry of entries) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      const contacts = value.contacts || [];
      const contactByWaId = new Map(contacts.map((contact) => [contact.wa_id, contact]));

      for (const message of value.messages || []) {
        const contact = contactByWaId.get(message.from) || {};
        events.push({
          phoneNumberId: value.metadata?.phone_number_id || "",
          from: message.from,
          messageId: message.id,
          timestamp: message.timestamp ? new Date(Number(message.timestamp) * 1000).toISOString() : new Date().toISOString(),
          type: message.type,
          body: extractMessageBody(message),
          profileName: contact.profile?.name || "",
          raw: message
        });
      }
    }
  }

  return events;
}

function extractEvolutionBody(data) {
  const msg = data?.message || {};
  if (msg.conversation) return msg.conversation;
  if (msg.extendedTextMessage?.text) return msg.extendedTextMessage.text;
  if (msg.imageMessage?.caption) return msg.imageMessage.caption || "[imagem]";
  if (msg.documentMessage) return msg.documentMessage.caption || msg.documentMessage.fileName || "[documento]";
  if (msg.audioMessage) return "[áudio]";
  if (msg.videoMessage) return msg.videoMessage.caption || "[vídeo]";
  if (msg.stickerMessage) return "[figurinha]";
  if (msg.reactionMessage) return `[reação: ${msg.reactionMessage.text || ""}]`;
  return "[mensagem]";
}

function extractMessageBody(message) {
  switch (message.type) {
    case "text":
      return message.text?.body || "";
    case "button":
      return message.button?.text || "";
    case "interactive":
      return message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || "[interativo]";
    case "image":
      return message.image?.caption || "[imagem]";
    case "document":
      return message.document?.caption || message.document?.filename || "[documento]";
    case "audio":
      return "[audio]";
    case "video":
      return message.video?.caption || "[video]";
    default:
      return `[${message.type || "mensagem"}]`;
  }
}
