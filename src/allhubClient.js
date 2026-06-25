import { randomId } from "./util.js";

// Cliente da integração com o AllHub (agentes IA especialistas em CISS-Poder).
// Contrato: /integration/v1/*. Auth por tenant (Bearer + X-AllHub-Tenant).
export class AllHubClient {
  constructor({ baseUrl, apiKey, tenant } = {}) {
    this.baseUrl = String(baseUrl || "").replace(/\/$/, "");
    this.apiKey = String(apiKey || "");
    this.tenant = String(tenant || "");
  }

  isConfigured() {
    return Boolean(this.baseUrl && this.apiKey);
  }

  async _request(method, path, body, { idempotencyKey } = {}) {
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
      "X-AllHub-Tenant": this.tenant
    };
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    const text = await res.text().catch(() => "");
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    if (!res.ok) {
      const msg = data?.error || data?.message || `HTTP ${res.status}`;
      const err = new Error(`AllHub ${method} ${path} → ${res.status}: ${msg}`);
      err.status = res.status;
      err.code = data?.code || null; // ex.: cliente_nao_vinculado (424)
      throw err;
    }
    return data;
  }

  // Valida a conexão e a api_key.
  async health() {
    return this._request("GET", "/integration/v1/health");
  }

  // Descoberta de agentes especialistas disponíveis.
  async listAgents() {
    return this._request("GET", "/integration/v1/agents");
  }

  // Fluxo A — pergunta a um especialista (apoio ao analista / resposta ao cliente).
  async assist(payload) {
    return this._request("POST", "/integration/v1/assist", payload, { idempotencyKey: `assist_${randomId()}` });
  }

  // Aprovação/rejeição de ações propostas que alteram o ERP.
  async approveAction(actionId) {
    return this._request("POST", `/integration/v1/actions/${encodeURIComponent(actionId)}/approve`, {}, { idempotencyKey: `approve_${actionId}` });
  }
  async rejectAction(actionId) {
    return this._request("POST", `/integration/v1/actions/${encodeURIComponent(actionId)}/reject`, {}, { idempotencyKey: `reject_${actionId}` });
  }
  async getAction(actionId) {
    return this._request("GET", `/integration/v1/actions/${encodeURIComponent(actionId)}`);
  }

  // Fluxo B — envia um atendimento RESOLVIDO para o agente aprender com a solução.
  async learnTicketResolved(payload) {
    return this._request("POST", "/integration/v1/learn/ticket-resolved", payload, { idempotencyKey: `learn_${payload?.ticket?.id || randomId()}` });
  }
}
