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
    // createEmptyData() garante todas as coleções (inclusive novas como tickets);
    // parsed sobrescreve com o que já existe no arquivo.
    this.data = {
      ...createEmptyData(),
      ...parsed,
      tenants: parsed.tenants || []
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

  findAll(collection, predicate) {
    const items = this.data[collection] || [];
    return predicate ? items.filter(predicate) : items.slice();
  }
}

function createEmptyData() {
  return {
    version: 1,
    tenants: [],
    contacts: [],
    conversations: [],
    messages: [],
    tickets: [],
    whatsappSettings: [],
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

  for (const collection of ["contacts", "conversations", "messages", "tickets", "integrationEvents", "auditEvents", "requestMetrics", "users", "userInvites", "emailVerifications", "oauthIdentities"]) {
    for (const record of data[collection] || []) {
      if (!record.tenantId) record.tenantId = defaultTenantId;
    }
  }
}

function createId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;
}

function prefixForCollection(collection) {
  const prefixes = {
    contacts: "ct",
    tenants: "tn",
    conversations: "cv",
    messages: "msg",
    tickets: "tk",
    whatsappSettings: "was",
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
