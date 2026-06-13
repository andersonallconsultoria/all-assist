const WEBHOOK_EVENTS = ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED"];

export class EvolutionApiClient {
  constructor(baseUrl, apiKey) {
    this.baseUrl = String(baseUrl || "").replace(/\/$/, "");
    this.apiKey = String(apiKey || "");
  }

  isConfigured() {
    return Boolean(this.baseUrl && this.apiKey);
  }

  async _request(method, path, body) {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: { "Content-Type": "application/json", apikey: this.apiKey },
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      let detail = text.slice(0, 300);
      try { detail = JSON.parse(text)?.message || detail; } catch { /**/ }
      throw new Error(`Evolution API ${method} ${path} → ${res.status}: ${detail}`);
    }
    return res.json().catch(() => ({}));
  }

  async createInstance(name, webhookUrl) {
    return this._request("POST", "/instance/create", {
      instanceName: name,
      qrcode: true,
      integration: "WHATSAPP-BAILEYS",
      webhook: { url: webhookUrl, byEvents: false, base64: false, events: WEBHOOK_EVENTS }
    });
  }

  async connectInstance(name) {
    return this._request("GET", `/instance/connect/${encodeURIComponent(name)}`);
  }

  async getConnectionState(name) {
    return this._request("GET", `/instance/connectionState/${encodeURIComponent(name)}`);
  }

  async setWebhook(name, webhookUrl) {
    return this._request("POST", `/webhook/set/${encodeURIComponent(name)}`, {
      url: webhookUrl,
      webhook_by_events: false,
      events: WEBHOOK_EVENTS
    });
  }

  async sendText(name, to, text, delayMs = 1200) {
    return this._request("POST", `/message/sendText/${encodeURIComponent(name)}`, {
      number: to,
      options: { delay: delayMs, presence: "composing" },
      textMessage: { text }
    });
  }

  async logout(name) {
    return this._request("DELETE", `/instance/logout/${encodeURIComponent(name)}`);
  }

  async deleteInstance(name) {
    return this._request("DELETE", `/instance/delete/${encodeURIComponent(name)}`);
  }
}
