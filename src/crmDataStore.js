import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export class CrmDataStore {
  constructor(filePath) {
    this.filePath = path.resolve(filePath);
    this.data = createEmptyData();
  }

  load() {
    if (!fs.existsSync(this.filePath)) {
      migrateData(this.data);
      return this.data;
    }

    const content = fs.readFileSync(this.filePath, "utf8");
    if (!content.trim()) {
      migrateData(this.data);
      return this.data;
    }

    const parsed = JSON.parse(content);
    this.data = {
      ...createEmptyData(),
      ...parsed,
      tenants: parsed.tenants || [],
      companyGroups: parsed.companyGroups || [],
      tenantCompanies: parsed.tenantCompanies || [],
      salesPeople: parsed.salesPeople || [],
      pipelines: parsed.pipelines || [],
      contacts: parsed.contacts || [],
      deals: parsed.deals || [],
      dealLogs: parsed.dealLogs || [],
      conversations: parsed.conversations || [],
      messages: parsed.messages || [],
      products: parsed.products || [],
      integrationSettings: parsed.integrationSettings || [],
      whatsappSettings: parsed.whatsappSettings || [],
      integrationSchedules: parsed.integrationSchedules || [],
      syncRuns: parsed.syncRuns || [],
      integrationEvents: parsed.integrationEvents || [],
      auditEvents: parsed.auditEvents || [],
      requestMetrics: parsed.requestMetrics || [],
      systemEvents: parsed.systemEvents || [],
      users: parsed.users || [],
      userInvites: parsed.userInvites || [],
      emailVerifications: parsed.emailVerifications || [],
      oauthIdentities: parsed.oauthIdentities || [],
      roles: parsed.roles || [],
      sessions: parsed.sessions || [],
      evolutionInstances: parsed.evolutionInstances || [],
      evolutionTenantConfig: parsed.evolutionTenantConfig || []
    };
    migrateData(this.data);
    return this.data;
  }

  save() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tempFile = `${this.filePath}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(this.data, null, 2), "utf8");
    fs.renameSync(tempFile, this.filePath);
  }

  list(collection) {
    return this.data[collection] || [];
  }

  insert(collection, record) {
    const now = new Date().toISOString();
    const next = {
      id: record.id || createId(prefixForCollection(collection)),
      createdAt: now,
      updatedAt: now,
      ...record
    };
    this.data[collection].push(next);
    return next;
  }

  update(collection, id, patch) {
    const records = this.data[collection];
    const index = records.findIndex((record) => String(record.id) === String(id));
    if (index < 0) return null;

    records[index] = {
      ...records[index],
      ...patch,
      updatedAt: new Date().toISOString()
    };
    return records[index];
  }

  remove(collection, id) {
    const records = this.data[collection];
    const index = records.findIndex((record) => String(record.id) === String(id));
    if (index < 0) return null;

    const [removed] = records.splice(index, 1);
    return removed || null;
  }

  findById(collection, id) {
    return this.data[collection].find((record) => String(record.id) === String(id)) || null;
  }

  findOne(collection, predicate) {
    return this.data[collection].find(predicate) || null;
  }
}

function createEmptyData() {
  return {
    version: 1,
    tenants: [],
    companyGroups: [],
    tenantCompanies: [],
    salesPeople: [],
    pipelines: [],
    contacts: [],
    deals: [],
    dealLogs: [],
    conversations: [],
    messages: [],
    products: [],
    integrationSettings: [],
    whatsappSettings: [],
    integrationSchedules: [],
    syncRuns: [],
    integrationEvents: [],
    auditEvents: [],
    requestMetrics: [],
    systemEvents: [],
    users: [],
    userInvites: [],
    emailVerifications: [],
    oauthIdentities: [],
    roles: [],
    sessions: [],
    evolutionInstances: [],
    evolutionTenantConfig: []
  };
}

function migrateData(data) {
  if (!data.tenants.length) {
    data.tenants.push({
      id: "tenant_default",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      name: "Cliente Padrao",
      slug: "default",
      status: "active",
      plan: "internal",
      metadata: {
        source: "migration"
      }
    });
  }

  const defaultTenantId = data.tenants[0]?.id || "tenant_default";
  if (!data.pipelines) data.pipelines = [];
  ensureDefaultPipelines(data);

  for (const collection of ["companyGroups", "tenantCompanies", "salesPeople", "pipelines", "contacts", "deals", "dealLogs", "conversations", "messages", "products", "integrationSettings", "integrationSchedules", "syncRuns", "integrationEvents", "auditEvents", "requestMetrics", "users", "userInvites", "emailVerifications", "oauthIdentities"]) {
    for (const record of data[collection] || []) {
      if (!record.tenantId) record.tenantId = defaultTenantId;
    }
  }

  for (const deal of data.deals || []) {
    if (!deal.pipelineId) deal.pipelineId = defaultPipelineIdForDeal(data, deal);
  }
}

function ensureDefaultPipelines(data) {
  const now = new Date().toISOString();
  for (const tenant of data.tenants || []) {
    const tenantPipelines = data.pipelines.filter((pipeline) => pipeline.tenantId === tenant.id);
    if (!tenantPipelines.some((pipeline) => pipeline.kind === "quote")) {
      data.pipelines.push(defaultPipeline(tenant.id, "quote", "Orcamentos", now));
    }
    if (!tenantPipelines.some((pipeline) => pipeline.kind === "order")) {
      data.pipelines.push(defaultPipeline(tenant.id, "order", "Pedidos", now));
    }
  }
}

function defaultPipeline(tenantId, kind, name, now) {
  return {
    id: defaultPipelineId(tenantId, kind),
    tenantId,
    createdAt: now,
    updatedAt: now,
    name,
    kind,
    isSystemDefault: true,
    stages: defaultStages()
  };
}

function defaultPipelineId(tenantId, kind) {
  return `pipe_${tenantId}_${kind === "quote" ? "quotes" : "orders"}`;
}

function defaultStages() {
  return [
    "Entrada",
    "Aguardando contato",
    "Em negociacao",
    "Venda efetivada",
    "Gerou documento fiscal",
    "Pedido negado",
    "Vencidos"
  ].map((name, index) => ({
    id: `stage_${index + 1}`,
    name,
    order: index + 1,
    color: name === "Vencidos" ? "#c0392b" : ""
  }));
}

function defaultPipelineIdForDeal(data, deal) {
  const tenantId = deal.tenantId || data.tenants[0]?.id || "tenant_default";
  const text = normalizeDealKindText(`${deal.customFields?.tipoDocumento || ""} ${deal.sourceRecord?.desrdav || ""} ${deal.title || ""}`);
  return defaultPipelineId(tenantId, text.includes("orcamento") ? "quote" : "order");
}

function normalizeDealKindText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function createId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;
}

function prefixForCollection(collection) {
  const prefixes = {
    contacts: "ct",
    tenants: "tn",
    companyGroups: "grp",
    tenantCompanies: "cmp",
    salesPeople: "sp",
    pipelines: "pipe",
    deals: "dl",
    dealLogs: "log",
    conversations: "cv",
    messages: "msg",
    products: "prd",
    integrationSettings: "cfg",
    whatsappSettings: "was",
    integrationSchedules: "sch",
    syncRuns: "run",
    integrationEvents: "int",
    auditEvents: "aud",
    requestMetrics: "req",
    systemEvents: "sys",
    users: "usr",
    userInvites: "inv",
    emailVerifications: "emv",
    oauthIdentities: "oid",
    roles: "rol",
    sessions: "ses"
  };
  return prefixes[collection] || "id";
}
