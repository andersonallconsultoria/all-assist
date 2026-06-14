import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { CrmDataStore } from "../src/crmDataStore.js";
import { VaultService } from "../src/vaultService.js";

process.env.ALLASSIST_VAULT_KEY = "chave-de-teste-super-secreta";

function createVault() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vault-"));
  const store = new CrmDataStore(path.join(dir, "data.json"));
  store.load();
  const tenant = store.list("tenants")[0] || store.insert("tenants", { name: "T", slug: "default", status: "active" });
  const customer = store.insert("customers", { tenantId: tenant.id, name: "Supermercado Big" });
  return { store, tenant, customer, vault: new VaultService(store, { debug() {}, info() {}, warn() {}, error() {} }) };
}

test("credencial é armazenada criptografada e revelada sob demanda", () => {
  const { store, tenant, customer, vault } = createVault();
  const created = vault.createCredential(tenant.id, customer.id, {
    label: "Banco de Produção",
    type: "database",
    host: "db.cliente.com.br",
    port: "5432",
    database: "erp",
    username: "admin",
    password: "S3nh@Secreta!"
  });

  // Metadados públicos não contêm segredo
  assert.equal(created.label, "Banco de Produção");
  assert.equal(created.password, undefined);

  // No armazenamento, a senha NÃO aparece em texto puro
  const stored = store.findById("credentials", created.id);
  assert.ok(stored.secret.startsWith("v1:"));
  assert.ok(!JSON.stringify(stored).includes("S3nh@Secreta!"), "senha não pode estar em texto puro");

  // Reveal traz os dados de conexão
  const revealed = vault.revealCredential(created.id, tenant.id);
  assert.equal(revealed.host, "db.cliente.com.br");
  assert.equal(revealed.password, "S3nh@Secreta!");
  assert.equal(revealed.username, "admin");
});

test("listByCustomer retorna só metadados; update reescreve segredo", () => {
  const { tenant, customer, vault } = createVault();
  vault.createCredential(tenant.id, customer.id, { label: "A", password: "x" });
  vault.createCredential(tenant.id, customer.id, { label: "B", password: "y" });
  const list = vault.listByCustomer(tenant.id, customer.id);
  assert.equal(list.length, 2);
  assert.ok(list.every((c) => c.password === undefined && c.secret === undefined));

  const updated = vault.updateCredential(list[0].id, tenant.id, { password: "novaSenha" }, "us_1");
  assert.equal(updated.password, undefined);
  assert.equal(vault.revealCredential(list[0].id, tenant.id).password, "novaSenha");
});

test("isolamento por tenant e exclusão", () => {
  const { store, tenant, customer, vault } = createVault();
  const other = store.insert("tenants", { name: "Outro", slug: "o", status: "active" });
  const cred = vault.createCredential(tenant.id, customer.id, { label: "X", password: "p" });
  assert.throws(() => vault.revealCredential(cred.id, other.id), /não encontrada/i);
  vault.deleteCredential(cred.id, tenant.id);
  assert.equal(vault.listByCustomer(tenant.id, customer.id).length, 0);
});
