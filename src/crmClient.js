import { requestJson } from "./http.js";

export class CrmClient {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
  }

  async sendLeadWebhook(payload) {
    const response = await requestJson(this.config.crm.leadWebhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    }, this.config.http);

    if (response?.testMode) {
      const error = new Error("CRM webhook is in test/listening mode and did not create a lead");
      error.response = response;
      throw error;
    }

    return response;
  }

  async listCommercialOrdersByPhone(phone) {
    const url = `${this.config.crm.baseUrl}/api/commercial-order?number=${encodeURIComponent(phone)}&limit=100`;
    const response = await requestJson(url, {
      headers: this.authHeaders()
    }, this.config.http);

    return Array.isArray(response?.data) ? response.data : [];
  }

  async updateCommercialOrder(identifier, payload) {
    const url = `${this.config.crm.baseUrl}/api/commercial-order/${encodeURIComponent(identifier)}`;
    return requestJson(url, {
      method: "PUT",
      headers: this.authHeaders(),
      body: JSON.stringify(payload)
    }, this.config.http);
  }

  authHeaders() {
    return {
      "api-key": this.config.crm.apiKey,
      "Content-Type": "application/json"
    };
  }
}

export function findLatestCommercialOrder(orders) {
  return [...orders].sort((a, b) => {
    const aDate = Date.parse(a.createdAt || a.updatedAt || "1970-01-01");
    const bDate = Date.parse(b.createdAt || b.updatedAt || "1970-01-01");
    return bDate - aDate;
  })[0] || null;
}
