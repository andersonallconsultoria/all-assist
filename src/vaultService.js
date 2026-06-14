import crypto from "node:crypto";
import { randomId } from "./util.js";

// Cofre de credenciais por cliente (dados de conexão / senhas de acesso).
// Os campos sensíveis são guardados criptografados (AES-256-GCM). A chave mestra
// vem de ALLASSIST_VAULT_KEY (variável de ambiente) e NUNCA é persistida.
// Sem a chave correta, os segredos não podem ser lidos.
const ENC_PREFIX = "v1";

function deriveKey() {
  const base = process.env.ALLASSIST_VAULT_KEY || "allassist-dev-insecure-key";
  return crypto.createHash("sha256").update(base).digest(); // 32 bytes
}

export function isVaultKeyConfigured() {
  return Boolean(process.env.ALLASSIST_VAULT_KEY);
}

function encrypt(plainObject) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", deriveKey(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(plainObject), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [ENC_PREFIX, iv.toString("base64"), tag.toString("base64"), data.toString("base64")].join(":");
}

function decrypt(blob) {
  const [prefix, ivB64, tagB64, dataB64] = String(blob || "").split(":");
  if (prefix !== ENC_PREFIX) throw new Error("Formato de credencial inválido");
  const decipher = crypto.createDecipheriv("aes-256-gcm", deriveKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const out = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]);
  return JSON.parse(out.toString("utf8"));
}

// accessId cobre ID/endereço de conexões remotas (TeamViewer, AnyDesk, etc.).
const SECRET_FIELDS = ["host", "port", "database", "username", "password", "url", "accessId", "notes"];

export class VaultService {
  constructor(store, logger) {
    this.store = store;
    this.logger = logger;
  }

  // Metadados visíveis na listagem (sem segredos).
  _publicView(cred) {
    return { id: cred.id, tenantId: cred.tenantId, customerId: cred.customerId, label: cred.label, category: cred.category || "access", type: cred.type, createdAt: cred.createdAt, updatedAt: cred.updatedAt };
  }

  listByCustomer(tenantId, customerId) {
    return this.store
      .findAll("credentials", (c) => c.tenantId === tenantId && c.customerId === customerId)
      .map((c) => this._publicView(c));
  }

  createCredential(tenantId, customerId, body, actor = "system") {
    if (!customerId) throw new Error("customerId obrigatório");
    const label = String(body.label || "").trim();
    if (!label) throw new Error("Rótulo obrigatório");
    const secret = {};
    for (const f of SECRET_FIELDS) secret[f] = body[f] !== undefined ? String(body[f]) : "";
    const cred = this.store.insert("credentials", {
      id: `cred_${randomId()}`,
      tenantId,
      customerId,
      label,
      category: body.category === "connection" ? "connection" : "access",
      type: String(body.type || "database"),
      secret: encrypt(secret),
      createdBy: actor
    });
    return this._publicView(cred);
  }

  updateCredential(id, tenantId, body, actor = "system") {
    const cred = this.store.findById("credentials", id);
    if (!cred || cred.tenantId !== tenantId) throw new Error("Credencial não encontrada");
    const patch = {};
    if (body.label !== undefined) patch.label = String(body.label).trim();
    if (body.category !== undefined) patch.category = body.category === "connection" ? "connection" : "access";
    if (body.type !== undefined) patch.type = String(body.type);
    // Reescreve o segredo apenas se algum campo sensível veio no corpo.
    if (SECRET_FIELDS.some((f) => body[f] !== undefined)) {
      const current = (() => { try { return decrypt(cred.secret); } catch { return {}; } })();
      const next = { ...current };
      for (const f of SECRET_FIELDS) if (body[f] !== undefined) next[f] = String(body[f]);
      patch.secret = encrypt(next);
    }
    patch.updatedBy = actor;
    const updated = this.store.update("credentials", id, patch);
    return this._publicView(updated);
  }

  // Descriptografa e retorna os dados de conexão (uso explícito do analista).
  revealCredential(id, tenantId) {
    const cred = this.store.findById("credentials", id);
    if (!cred || cred.tenantId !== tenantId) throw new Error("Credencial não encontrada");
    const data = decrypt(cred.secret);
    return { ...this._publicView(cred), ...data };
  }

  deleteCredential(id, tenantId) {
    const cred = this.store.findById("credentials", id);
    if (!cred || cred.tenantId !== tenantId) throw new Error("Credencial não encontrada");
    this.store.remove("credentials", id);
    return { ok: true };
  }
}
