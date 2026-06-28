import { normalizeToE164 } from "./whatsappMetaClient.js";
import { randomId } from "./util.js";

const META_STATUS_MAP = { sent: "sent", delivered: "delivered", read: "read", failed: "failed" };
const EVO_STATUS_MAP = {
  0: "failed", 1: "sending", 2: "sent", 3: "delivered", 4: "read", 5: "read",
  ERROR: "failed", PENDING: "sending", SERVER_ACK: "sent", DELIVERY_ACK: "delivered", READ: "read", PLAYED: "read"
};
const MSG_STATUS_ORDER = ["sending", "queued", "sent", "delivered", "read"];

export class ConversationService {
  constructor(store, whatsappClient, logger, evolutionInstanceService = null, fileStore = null) {
    this.store = store;
    this.whatsappClient = whatsappClient;
    this.logger = logger;
    this.evolutionInstanceService = evolutionInstanceService;
    this.fileStore = fileStore;
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

      // Mídia recebida: baixa em background e anexa à mensagem (não bloqueia o webhook).
      if (event.media?.sourceId) this._fetchMetaInboundMedia(message.id, event.media);

      saved.push({ contact, conversation, message });
    }

    return saved;
  }

  // Baixa uma mídia recebida da Meta e anexa ao registro da mensagem.
  async _fetchMetaInboundMedia(messageId, media) {
    if (!this.fileStore || typeof this.whatsappClient?.downloadMedia !== "function") return;
    try {
      const { buffer, mime } = await this.whatsappClient.downloadMedia(media.sourceId);
      const mediaId = `med_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 8)}`;
      this.fileStore.save(mediaId, buffer);
      this.store.update("messages", messageId, { mediaId, mediaMime: mime || media.mime, mediaName: media.name });
      this.store.save?.();
    } catch (error) {
      this.logger?.warn?.("inbound_media_download_failed", { error: error.message });
    }
  }

  // Resolve o número de WhatsApp para envio. O WhatsApp moderno pode entregar
  // um LID (código de privacidade, ~15 dígitos, sem o 55) no lugar do número
  // real — não dá para responder nele. Prioridade: número do cliente vinculado,
  // depois o telefone do próprio contato. Se nada parecer um telefone válido,
  // lança erro claro pedindo para informar o número.
  _looksLikePhone(digits) {
    const d = String(digits || "").replace(/\D/g, "");
    return d.length >= 10 && d.length <= 13;
  }

  // Chave canônica para casar o mesmo contato BR com/sem o nono dígito.
  // Ex.: 5546999812497 e 554699812497 → "4699812497" (mesma pessoa).
  _brKey(raw) {
    let d = String(raw || "").replace(/\D/g, "");
    if (d.startsWith("55")) d = d.slice(2);              // remove país
    if (d.length === 11 && d[2] === "9") d = d.slice(0, 2) + d.slice(3); // remove nono dígito
    return d;
  }

  async _fetchEvolutionAvatar(instanceName, remoteJid, contact, tenantId) {
    if (!this.evolutionInstanceService || !instanceName || !remoteJid) return;
    // Renova a foto no máximo 1x/dia (a URL do WhatsApp expira).
    const fresh = this.store.findById("contacts", contact.id) || contact;
    const last = fresh.avatarFetchedAt ? Date.parse(fresh.avatarFetchedAt) : 0;
    if (fresh.avatarUrl && Date.now() - last < 24 * 60 * 60 * 1000) return;
    const instance = this.evolutionInstanceService.getByTenant(tenantId);
    if (!instance) return;
    const { EvolutionApiClient } = await import("./evolutionApiClient.js");
    const evo = new EvolutionApiClient(instance.apiUrl, instance.apiKey);
    const res = await evo.fetchProfilePictureUrl(instanceName, remoteJid);
    const url = res?.profilePictureUrl || res?.profilePicUrl || null;
    this.store.update("contacts", contact.id, { avatarUrl: url || fresh.avatarUrl || null, avatarFetchedAt: new Date().toISOString() });
    this.store.save();
  }

  // Baixa mídias recebidas que ainda não têm arquivo local (ex.: áudios que
  // chegaram antes desta função existir). Chamado ao abrir o atendimento.
  backfillInboundMedia(messages, instanceName, tenantId) {
    for (const m of messages || []) {
      if (m.direction !== "inbound" || m.mediaId || !m.providerMessageId) continue;
      const info = evolutionMediaInfo(m.raw);
      if (!info) continue;
      if (m.type !== info.type) {
        this.store.update("messages", m.id, { type: info.type, mediaMime: m.mediaMime || info.mime, mediaName: m.mediaName || info.name });
      }
      this._fetchEvolutionInboundMedia(instanceName, m.providerMessageId, m.id, tenantId).catch(() => {});
    }
  }

  // Cria/atualiza o "contato" que representa um GRUPO de WhatsApp. O grupo é o
  // cliente do atendimento; o autor de cada mensagem é guardado na própria
  // mensagem (authorName).
  upsertGroupContact({ jid, tenantId }) {
    let contact = this.store.findOne("contacts", (c) => c.tenantId === tenantId && c.whatsappJid === jid);
    const patch = {
      tenantId: contact?.tenantId || tenantId,
      name: contact?.name || `Grupo ${jid.replace(/@.*/, "").slice(-6)}`,
      phone: jid,            // o JID @g.us é o destino de envio do grupo
      whatsappJid: jid,
      isGroup: true,
      source: "whatsapp-group",
      lastSeenAt: new Date().toISOString()
    };
    if (contact) return this.store.update("contacts", contact.id, patch);
    return this.store.insert("contacts", patch);
  }

  // Busca o nome e a foto do grupo na Evolution (assíncrono).
  async _fetchEvolutionGroupInfo(instanceName, groupJid, contact, tenantId) {
    if (!this.evolutionInstanceService || !instanceName) return;
    const fresh = this.store.findById("contacts", contact.id) || contact;
    const last = fresh.groupInfoAt ? Date.parse(fresh.groupInfoAt) : 0;
    if (fresh.name && !fresh.name.startsWith("Grupo ") && fresh.avatarUrl && Date.now() - last < 24 * 60 * 60 * 1000) return;
    const instance = this.evolutionInstanceService.getByTenant(tenantId);
    if (!instance) return;
    const { EvolutionApiClient } = await import("./evolutionApiClient.js");
    const evo = new EvolutionApiClient(instance.apiUrl, instance.apiKey);
    const info = await evo.getGroupInfo(instanceName, groupJid);
    const patch = { groupInfoAt: new Date().toISOString() };
    if (info?.subject) patch.name = info.subject;
    if (info?.pictureUrl || info?.profilePicUrl) patch.avatarUrl = info.pictureUrl || info.profilePicUrl;
    this.store.update("contacts", contact.id, patch);
    this.store.save();
  }

  async _fetchEvolutionInboundMedia(instanceName, messageKeyId, messageId, tenantId) {
    if (!this.fileStore || !this.evolutionInstanceService) return;
    const instance = this.evolutionInstanceService.getByTenant(tenantId);
    if (!instance) return;
    const { EvolutionApiClient } = await import("./evolutionApiClient.js");
    const evo = new EvolutionApiClient(instance.apiUrl, instance.apiKey);
    const res = await evo.getMediaBase64(instanceName, messageKeyId);
    const base64 = res?.base64;
    if (!base64) return;
    const buffer = Buffer.from(base64, "base64");
    const mediaId = `med_${randomId()}`;
    this.fileStore.save(mediaId, buffer);
    this.store.update("messages", messageId, { mediaId });
    this.store.save();
  }

  _resolveWhatsappNumber(contact) {
    // Grupo: envia para o próprio JID do grupo (@g.us).
    if (contact.isGroup && contact.whatsappJid) return contact.whatsappJid;
    const candidates = [];
    if (contact.customerId) {
      const customer = this.store.findById("customers", contact.customerId);
      if (customer?.whatsapp) candidates.push(customer.whatsapp);
      if (customer?.phone) candidates.push(customer.phone);
    }
    candidates.push(contact.whatsappNumber, contact.phone);
    for (const c of candidates) {
      const digits = String(c || "").replace(/\D/g, "");
      if (this._looksLikePhone(digits)) return digits;
    }
    // Fallback: usa o JID original do WhatsApp (inclui o LID). A Evolution
    // v2.3.7+ resolve o LID para o número real na hora de enviar.
    if (contact.whatsappJid) return contact.whatsappJid;
    throw new Error("Número do cliente não identificado (privacidade do WhatsApp). Informe o número real no contato para responder.");
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

    // Assina a mensagem com o nome do analista (negrito do WhatsApp) para o
    // cliente saber com quem fala. Só para envio humano; configurável por
    // tenant (signMessages, ligado por padrão). O texto salvo fica sem o prefixo.
    const sender = senderUserId ? this.store.findById("users", senderUserId) : null;
    const tenant = this.store.findById("tenants", conversation.tenantId || tenantId);
    const signEnabled = tenant?.signMessages !== false;
    const outboundText = (signEnabled && sender?.name) ? `*${sender.name}*\n${body}` : body;

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
      const sendTo = this._resolveWhatsappNumber(contact);
      providerResponse = await evoClient.sendText(instance.instanceName, sendTo, outboundText, delayMs);
      this.evolutionInstanceService.recordSent(instance.id);
      status = "sent";
    } else if (provider === "meta" && this.whatsappClient.isConfigured()) {
      providerResponse = await this.whatsappClient.sendText({ to: contact.phone, body: outboundText });
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

  // Envia uma enquete (poll) do WhatsApp — usada como menu clicável do bot.
  // Só funciona via Evolution (Baileys). Salva uma mensagem representando a
  // enquete no histórico do atendimento.
  async sendPoll(conversationId, { question, options }, actor = "bot", tenantId = "", senderUserId = null) {
    const conversation = this.store.findById("conversations", conversationId);
    if (!conversation) throw new Error("Conversation not found");
    const contact = this.store.findById("contacts", conversation.contactId);
    if (!contact) throw new Error("Conversation contact not found");
    const values = (options || []).map((o) => String(o || "").trim()).filter(Boolean).slice(0, 12);
    if (!values.length) return null;

    let status = "queued";
    let providerResponse = null;
    if ((conversation.provider || "meta") === "evolution" && this.evolutionInstanceService) {
      const effectiveTenantId = conversation.tenantId || tenantId;
      const instance = (senderUserId && this.evolutionInstanceService.getByUser(effectiveTenantId, senderUserId))
        || this.evolutionInstanceService.getByTenant(effectiveTenantId);
      if (instance && instance.status === "connected") {
        const { EvolutionApiClient } = await import("./evolutionApiClient.js");
        const evoClient = new EvolutionApiClient(instance.apiUrl, instance.apiKey);
        const sendTo = this._resolveWhatsappNumber(contact);
        const delayMs = this.evolutionInstanceService.randomDelay(instance);
        providerResponse = await evoClient.sendPoll(instance.instanceName, sendTo, { question, values, delayMs });
        this.evolutionInstanceService.recordSent(instance.id);
        status = "sent";
      }
    }

    const body = `📊 ${question}\n${values.map((v, i) => `${i + 1}. ${v}`).join("\n")}`;
    const message = this.store.insert("messages", {
      tenantId: conversation.tenantId || defaultTenantId(this.store),
      conversationId, contactId: contact.id,
      direction: "outbound", channel: "whatsapp", provider: conversation.provider || "evolution",
      providerMessageId: providerResponse?.key?.id || "",
      from: "crm", to: normalizeToE164(contact.phone),
      type: "poll", pollOptions: values, body, raw: providerResponse || {}, status, actor
    });
    this.store.update("conversations", conversation.id, { lastMessageAt: message.createdAt, lastMessagePreview: "📊 Enquete enviada" });
    return message;
  }

  // Registra (e tenta enviar) uma mensagem de mídia já armazenada no fileStore.
  // O envio real pelo WhatsApp depende do provider suportar mídia e estar
  // conectado; se não, a mensagem fica registrada (status "queued").
  async sendMedia(conversationId, { mediaId, mediaMime, mediaName, mediaType, caption = "", buffer = null }, actor = "user", tenantId = "", senderUserId = null) {
    const conversation = this.store.findById("conversations", conversationId);
    if (!conversation) throw new Error("Conversation not found");
    if (tenantId && conversation.tenantId !== tenantId) throw new Error("Conversation not found");
    const contact = this.store.findById("contacts", conversation.contactId);
    if (!contact) throw new Error("Conversation contact not found");

    const provider = conversation.provider || "meta";
    let providerResponse = null;
    let status = "queued";

    // Tentativa de envio pelo provider (defensiva — não quebra o registro local).
    try {
      if (provider === "evolution" && this.evolutionInstanceService) {
        const effectiveTenantId = conversation.tenantId || tenantId;
        const instance = (senderUserId && this.evolutionInstanceService.getByUser(effectiveTenantId, senderUserId))
          || this.evolutionInstanceService.getByTenant(effectiveTenantId);
        if (instance && instance.status === "connected") {
          const { EvolutionApiClient } = await import("./evolutionApiClient.js");
          const evoClient = new EvolutionApiClient(instance.apiUrl, instance.apiKey);
          const delayMs = this.evolutionInstanceService.randomDelay(instance);
          const sendTo = this._resolveWhatsappNumber(contact);
          providerResponse = await evoClient.sendMedia(instance.instanceName, sendTo, {
            mediaType, mime: mediaMime, fileName: mediaName, caption,
            base64: buffer ? buffer.toString("base64") : "", delayMs
          });
          this.evolutionInstanceService.recordSent(instance.id);
          status = "sent";
        }
      } else if (provider === "meta" && this.whatsappClient.isConfigured()) {
        providerResponse = await this.whatsappClient.sendMedia({ to: contact.phone, mediaType, mime: mediaMime, fileName: mediaName, caption, buffer });
        status = "sent";
      }
    } catch (error) {
      this.logger?.warn?.("send_media_provider_failed", { error: error.message });
      status = "queued";
    }

    const preview = caption || ({ image: "📷 Imagem", audio: "🎤 Áudio", video: "🎬 Vídeo", document: "📎 Documento" }[mediaType] || "📎 Anexo");
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
      type: mediaType || "document",
      body: caption,
      mediaId,
      mediaMime,
      mediaName,
      raw: providerResponse || {},
      status,
      actor
    });

    this.store.update("conversations", conversation.id, {
      lastMessageAt: message.createdAt,
      lastMessagePreview: preview,
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
        // Evolution v2 envia o update em formato PLANO (keyId/fromMe/status na
        // raiz), enquanto o upsert usa aninhado (key.id/key.fromMe). Aceita os
        // dois para os checks ✓✓ (entregue) e azul (lido) funcionarem.
        const fromMe = upd?.key?.fromMe ?? upd?.fromMe;
        if (fromMe === false) continue;
        const providerId = upd?.key?.id || upd?.keyId || upd?.messageId || upd?.id;
        const rawStatus = upd?.update?.status ?? upd?.status;
        const status = EVO_STATUS_MAP[rawStatus] || null;
        const result = providerId && status ? this.updateMessageStatus(providerId, status) : null;
        this.logger?.warn?.("evo_status_update", { providerId: providerId ? String(providerId).slice(0, 22) : null, rawStatus, mapped: status, matched: Boolean(result) });
      }
      this.store.save();
      return { type: "status_update" };
    }

    if (event === "messages.upsert") {
      const data = payload?.data;
      if (!data || data?.key?.fromMe) return null; // ignora mensagens enviadas por nós

      const remoteJid = data.key?.remoteJid || "";
      const isGroup = remoteJid.endsWith("@g.us");
      // Em grupo o autor é o participante; o "contato" do atendimento é o grupo.
      const participant = data.key?.participant || data.participant || "";
      const authorName = isGroup ? (data.pushName || participant.replace(/@.*/, "")) : "";
      const phone = isGroup ? remoteJid : remoteJid.replace("@s.whatsapp.net", "").replace("@c.us", "");
      if (!phone) return null;

      const body = extractEvolutionBody(data);
      const profileName = data.pushName || phone;
      const timestamp = data.messageTimestamp
        ? new Date(Number(data.messageTimestamp) * 1000).toISOString()
        : new Date().toISOString();

      // Verifica opt-out (só em conversa 1-a-1)
      if (!isGroup && this.evolutionInstanceService) {
        const instance = this.evolutionInstanceService.getByTenant(tenantId);
        if (instance && this.evolutionInstanceService.checkOptOutPhrase(body)) {
          this.evolutionInstanceService.addOptOut(instance.id, phone);
          this.logger.info("evolution_opt_out_detected", { tenantId, phone, body });
        }
      }

      const contact = isGroup
        ? this.upsertGroupContact({ jid: remoteJid, tenantId })
        : this.upsertContactFromWhatsApp({ from: phone, profileName, body, timestamp, whatsappJid: remoteJid }, tenantId);
      const conversation = this.openConversation(contact, { timestamp, body }, "evolution", payload._instanceId || null);

      // Foto/identidade (assíncrono): 1-a-1 busca foto do contato; grupo busca
      // nome e foto do grupo.
      if (isGroup) this._fetchEvolutionGroupInfo(instanceName, remoteJid, contact, tenantId).catch(() => {});
      else this._fetchEvolutionAvatar(instanceName, remoteJid, contact, tenantId).catch(() => {});

      const media = evolutionMediaInfo(data);
      const message = this.store.insert("messages", {
        tenantId,
        conversationId: conversation.id,
        contactId: contact.id,
        direction: "inbound",
        channel: "whatsapp",
        provider: "evolution",
        providerMessageId: data.key?.id || "",
        from: isGroup ? (participant || remoteJid) : phone,
        authorName: authorName || undefined,
        to: instanceName || "",
        type: media ? media.type : "text",
        mediaMime: media ? media.mime : undefined,
        mediaName: media ? media.name : undefined,
        body,
        raw: data,
        status: "received",
        timestamp
      });

      // Mídia recebida (áudio/imagem/vídeo/documento): baixa da Evolution e
      // salva localmente para o analista ouvir/ver no chat (assíncrono).
      if (media && data.key?.id) {
        this._fetchEvolutionInboundMedia(instanceName, data.key.id, message.id, tenantId).catch(() => {});
      }

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
    const jid = event.whatsappJid || "";
    const isLid = jid.endsWith("@lid");
    const rawDigits = String(event.from || "").replace(/\D/g, "");
    // Número confiável (não-LID) é guardado já com o 55 (E.164 BR).
    const phone = (!isLid && rawDigits)
      ? (rawDigits.startsWith("55") ? rawDigits : `55${rawDigits}`)
      : "";
    const key = this._brKey(event.from);

    // Casa o contato por identificador do WhatsApp OU por número canônico
    // (com/sem nono dígito) — evita duplicar o mesmo cliente.
    let contact = this.store.findOne("contacts", (item) => {
      if (item.tenantId !== tenantId) return false;
      if (jid && item.whatsappJid && item.whatsappJid === jid) return true;
      if (key && item.phone && this._brKey(item.phone) === key) return true;
      return false;
    });

    const patch = {
      tenantId: contact?.tenantId || tenantId,
      name: event.profileName || contact?.name || event.from,
      source: "whatsapp",
      lastSeenAt: new Date().toISOString()
    };
    // Só sobrescreve o telefone quando temos um número real (não-LID).
    if (phone) patch.phone = phone;
    else if (!contact?.phone) patch.phone = rawDigits;
    if (jid) patch.whatsappJid = jid;

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
        const mediaPart = message[message.type];
        const media = mediaPart && mediaPart.id
          ? { sourceId: mediaPart.id, mime: mediaPart.mime_type || "", name: mediaPart.filename || message.type }
          : null;
        events.push({
          phoneNumberId: value.metadata?.phone_number_id || "",
          from: message.from,
          messageId: message.id,
          timestamp: message.timestamp ? new Date(Number(message.timestamp) * 1000).toISOString() : new Date().toISOString(),
          type: message.type,
          body: extractMessageBody(message),
          media,
          profileName: contact.profile?.name || "",
          raw: message
        });
      }
    }
  }

  return events;
}

// Detecta mídia numa mensagem recebida da Evolution e normaliza o tipo para o
// que o frontend espera (audio/image/video/document).
function evolutionMediaInfo(data) {
  const msg = data?.message || {};
  if (msg.audioMessage) return { type: "audio", mime: msg.audioMessage.mimetype || "audio/ogg", name: "audio.ogg" };
  if (msg.imageMessage) return { type: "image", mime: msg.imageMessage.mimetype || "image/jpeg", name: "imagem.jpg" };
  if (msg.videoMessage) return { type: "video", mime: msg.videoMessage.mimetype || "video/mp4", name: "video.mp4" };
  if (msg.documentMessage) return { type: "document", mime: msg.documentMessage.mimetype || "application/octet-stream", name: msg.documentMessage.fileName || "documento" };
  if (msg.stickerMessage) return { type: "image", mime: msg.stickerMessage.mimetype || "image/webp", name: "figurinha.webp" };
  return null;
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
