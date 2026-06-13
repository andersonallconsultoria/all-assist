import { requestJson } from "./http.js";

export class CissClient {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.token = "";
  }

  async authenticate() {
    const missing = [];
    if (!this.config.ciss.baseUrl) missing.push("endereco do ERP");
    if (!this.config.ciss.username) missing.push("usuario");
    if (!this.config.ciss.password) missing.push("senha");
    if (!this.config.ciss.clientSecret) missing.push("client secret");
    if (missing.length) {
      throw new Error(`Integracao ERP incompleta: configure ${missing.join(", ")}`);
    }

    const url = `${this.config.ciss.baseUrl}/cisspoder-auth/oauth/token`;
    const body = new URLSearchParams({
      password: this.config.ciss.password,
      username: this.config.ciss.username,
      grant_type: "password",
      client_secret: this.config.ciss.clientSecret,
      client_id: this.config.ciss.clientId
    });

    const response = await requestJson(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body
    }, this.config.http);

    this.token = response?.access_token || response?.token || response?.accessToken || "";
    if (!this.token) {
      throw new Error("CISS auth response did not include an access token");
    }

    this.logger.info("ciss_auth_success", { username: this.config.ciss.username });
    return this.token;
  }

  async fetchSalesManagementPage({ page, dtIni, dtFim }) {
    if (!this.token) await this.authenticate();

    const url = `${this.config.ciss.baseUrl}/cisspoder-service/crm/gestao_vendas`;
    const payload = {
      limit: this.config.ciss.pageLimit,
      page,
      clausulas: [
        {
          campo: "dtfim",
          operadorlogico: "AND",
          operador: "IGUAL",
          valor: dtFim
        },
        {
          campo: "dtini",
          operadorlogico: "AND",
          operador: "IGUAL",
          valor: dtIni
        },
        {
          campo: "idempresa",
          operadorlogico: "AND",
          operador: "IGUAL",
          valor: this.config.ciss.idEmpresa
        }
      ]
    };

    const response = await requestJson(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`
      },
      body: JSON.stringify(payload)
    }, this.config.http);

    const data = Array.isArray(response?.data) ? response.data : [];
    return {
      data,
      total: Number(response?.total || data.length),
      hasNext: Boolean(response?.hasNext)
    };
  }
}
