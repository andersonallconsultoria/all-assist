import crypto from "node:crypto";
import { requestJson } from "./http.js";

export class WhatsAppMetaClient {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
  }

  isConfigured() {
    return Boolean(this.config.meta.phoneNumberId && this.config.meta.accessToken);
  }

  async sendText({ to, body }) {
    this.ensureConfigured();
    const url = this.messagesUrl();
    return requestJson(url, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: normalizeToE164(to),
        type: "text",
        text: {
          preview_url: false,
          body
        }
      })
    }, this.config.http);
  }

  async sendTemplate({ to, templateName, language = "pt_BR", components = [] }) {
    this.ensureConfigured();
    const url = this.messagesUrl();
    return requestJson(url, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: normalizeToE164(to),
        type: "template",
        template: {
          name: templateName,
          language: { code: language },
          components
        }
      })
    }, this.config.http);
  }

  async listTemplates({ wabaId: overrideWabaId, accessToken: overrideAccessToken } = {}) {
    const wabaId = overrideWabaId || this.config.meta.wabaId;
    const accessToken = overrideAccessToken || this.config.meta.accessToken;
    if (!wabaId) throw new Error("META_WABA_ID nao configurado");
    if (!accessToken) throw new Error("META_ACCESS_TOKEN nao configurado");
    const version = this.config.meta.graphVersion || "v23.0";
    const url = `https://graph.facebook.com/${version}/${wabaId}/message_templates?fields=name,status,language,components&limit=100`;
    return requestJson(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      }
    }, this.config.http);
  }

  // Envia mídia: faz upload do arquivo (obtém media_id) e envia a mensagem.
  async sendMedia({ to, mediaType, mime, fileName, caption, buffer }) {
    this.ensureConfigured();
    if (!buffer || !buffer.length) throw new Error("Arquivo de mídia vazio");
    const version = this.config.meta.graphVersion || "v23.0";
    const uploadUrl = `https://graph.facebook.com/${version}/${this.config.meta.phoneNumberId}/media`;
    const boundary = "----allassist" + crypto.randomBytes(8).toString("hex");
    const head = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="messaging_product"\r\n\r\nwhatsapp\r\n` +
      `--${boundary}\r\nContent-Disposition: form-data; name="type"\r\n\r\n${mime}\r\n` +
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: ${mime}\r\n\r\n`, "utf8");
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
    const upRes = await fetch(uploadUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.config.meta.accessToken}`, "Content-Type": `multipart/form-data; boundary=${boundary}` },
      body: Buffer.concat([head, buffer, tail])
    });
    const upData = await upRes.json();
    if (!upRes.ok || !upData.id) throw new Error("Falha no upload de mídia Meta: " + JSON.stringify(upData));

    const type = ["image", "audio", "video", "document"].includes(mediaType) ? mediaType : "document";
    const mediaObj = { id: upData.id };
    if (type !== "audio" && caption) mediaObj.caption = caption;
    if (type === "document" && fileName) mediaObj.filename = fileName;
    return requestJson(this.messagesUrl(), {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: normalizeToE164(to), type, [type]: mediaObj })
    }, this.config.http);
  }

  // Baixa uma mídia recebida (retorna { buffer, mime }).
  async downloadMedia(mediaId) {
    this.ensureConfigured();
    const version = this.config.meta.graphVersion || "v23.0";
    const metaRes = await fetch(`https://graph.facebook.com/${version}/${mediaId}`, { headers: { Authorization: `Bearer ${this.config.meta.accessToken}` } });
    const meta = await metaRes.json();
    if (!meta.url) throw new Error("Mídia não encontrada na Meta");
    const fileRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${this.config.meta.accessToken}` } });
    return { buffer: Buffer.from(await fileRes.arrayBuffer()), mime: meta.mime_type || "application/octet-stream" };
  }

  async markAsRead(messageId) {
    if (!messageId || !this.isConfigured()) return null;
    return requestJson(this.messagesUrl(), {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        messaging_product: "whatsapp",
        status: "read",
        message_id: messageId
      })
    }, this.config.http);
  }

  verifySignature(rawBody, signatureHeader) {
    const secret = this.config.meta.appSecret;
    if (!secret) return true;
    if (!signatureHeader?.startsWith("sha256=")) return false;

    const expected = crypto
      .createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");
    const received = signatureHeader.slice("sha256=".length);

    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received));
  }

  messagesUrl() {
    return `https://graph.facebook.com/${this.config.meta.graphVersion}/${this.config.meta.phoneNumberId}/messages`;
  }

  headers() {
    return {
      Authorization: `Bearer ${this.config.meta.accessToken}`,
      "Content-Type": "application/json"
    };
  }

  ensureConfigured() {
    if (!this.isConfigured()) {
      throw new Error("Meta WhatsApp Cloud API is not configured");
    }
  }
}

export function normalizeToE164(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55")) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}
