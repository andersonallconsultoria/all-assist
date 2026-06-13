import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { CommercialStructureService, parseErpSeller } from "../src/commercialStructureService.js";
import { CrmDataStore } from "../src/crmDataStore.js";
import { TenantService } from "../src/tenantService.js";

test("CommercialStructureService creates SaaS client groups, CNPJs, supervisor and ERP seller", () => {
  const { store, tenantService, structureService } = createFixture();
  const tenant = tenantService.createTenant({
    name: "Cliente Padrao Multi Loja",
    slug: "cliente-padrao",
    plan: "business",
    userLimit: 25
  });

  const materiais = structureService.createCompanyGroup({
    tenantId: tenant.id,
    name: "Grupo Materiais",
    slug: "materiais"
  });
  const supermercado = structureService.createCompanyGroup({
    tenantId: tenant.id,
    name: "Grupo Supermercado",
    slug: "supermercado"
  });

  const lojaMatriz = structureService.createCompany({
    tenantId: tenant.id,
    groupId: materiais.id,
    erpCompanyId: 1,
    legalName: "Materiais Lobato Matriz Ltda",
    tradeName: "Materiais Lobato Matriz",
    document: "12.345.678/0001-90",
    city: "Manaus",
    state: "AM"
  });
  const lojaFilial = structureService.createCompany({
    tenantId: tenant.id,
    groupId: materiais.id,
    erpCompanyId: 2,
    legalName: "Materiais Lobato Filial Ltda",
    tradeName: "Materiais Lobato Filial",
    document: "12.345.678/0002-70"
  });
  const mercado = structureService.createCompany({
    tenantId: tenant.id,
    groupId: supermercado.id,
    erpCompanyId: 10,
    legalName: "Supermercado Lobato Ltda",
    tradeName: "Supermercado Lobato",
    document: "98.765.432/0001-10"
  });

  const supervisorUser = store.insert("users", {
    tenantId: tenant.id,
    roleId: "role_supervisor",
    name: "Supervisor Comercial",
    email: "supervisor@example.com",
    status: "active"
  });
  const sellerUser = store.insert("users", {
    tenantId: tenant.id,
    roleId: "role_seller",
    name: "Vendedor Exemplo",
    email: "vendedor@example.com",
    status: "active"
  });
  const adminUser = store.insert("users", {
    tenantId: tenant.id,
    roleId: "role_admin",
    name: "Admin Cliente",
    email: "admin.cliente@example.com",
    status: "active"
  });

  const supervisor = structureService.createSalesPerson({
    tenantId: tenant.id,
    type: "supervisor",
    name: "Supervisor Comercial",
    userId: supervisorUser.id,
    groupIds: [materiais.id]
  });
  const seller = structureService.createSellerFromErp({
    tenantId: tenant.id,
    erpSeller: "2 - VENDEDOR EXEMPLO",
    userId: sellerUser.id,
    supervisorId: supervisor.id,
    companyIds: [lojaMatriz.id, lojaFilial.id]
  });

  const scopedSupervisor = structureService.setUserScope(supervisorUser.id, {
    tenantId: tenant.id,
    mode: "groups",
    groupIds: [materiais.id]
  });
  const scopedSeller = structureService.setUserScope(sellerUser.id, {
    tenantId: tenant.id,
    mode: "seller",
    sellerProfileId: seller.id
  });
  const scopedAdmin = structureService.setUserScope(adminUser.id, {
    tenantId: tenant.id,
    mode: "tenant"
  });

  assert.equal(seller.erpCode, "2");
  assert.equal(seller.name, "VENDEDOR EXEMPLO");
  assert.equal(seller.supervisorId, supervisor.id);
  assert.deepEqual(
    structureService.listSellersForSupervisor(supervisor.id).map((item) => item.id),
    [seller.id]
  );

  assert.equal(structureService.canAccessCompany(scopedSupervisor, lojaMatriz.id), true);
  assert.equal(structureService.canAccessCompany(scopedSupervisor, mercado.id), false);
  assert.equal(structureService.canAccessCompany(scopedSeller, lojaMatriz.id), true);
  assert.equal(structureService.canAccessCompany(scopedSeller, lojaFilial.id), true);
  assert.equal(structureService.canAccessCompany(scopedSeller, mercado.id), false);
  assert.equal(structureService.canAccessCompany(scopedAdmin, mercado.id), true);

  const resolved = structureService.resolveRecordScope(tenant.id, {
    idempresa: 1,
    vendedores: "2 - VENDEDOR EXEMPLO"
  });

  assert.equal(resolved.group.id, materiais.id);
  assert.equal(resolved.company.id, lojaMatriz.id);
  assert.equal(resolved.seller.id, seller.id);
  assert.equal(resolved.supervisor.id, supervisor.id);
  assert.equal(resolved.erpSeller.code, "2");

  const tenantWithUsage = tenantService.listTenants().find((item) => item.id === tenant.id);
  assert.equal(tenantWithUsage.usage.groups, 2);
  assert.equal(tenantWithUsage.usage.companies, 3);
  assert.equal(tenantWithUsage.usage.sellers, 1);
  assert.equal(tenantWithUsage.usage.supervisors, 1);
});

test("CommercialStructureService rejects duplicate ERP company and seller codes per tenant", () => {
  const { tenantService, structureService } = createFixture();
  const tenant = tenantService.createTenant({ name: "Boa Vista Pisos", slug: "boa-vista" });
  const group = structureService.createCompanyGroup({ tenantId: tenant.id, name: "Lojas Boa Vista" });

  structureService.createCompany({
    tenantId: tenant.id,
    groupId: group.id,
    erpCompanyId: 1,
    legalName: "Boa Vista Matriz"
  });
  structureService.createSellerFromErp({
    tenantId: tenant.id,
    erpSeller: "2 - VENDEDOR EXEMPLO"
  });

  assert.throws(
    () => structureService.createCompany({
      tenantId: tenant.id,
      groupId: group.id,
      erpCompanyId: 1,
      legalName: "Boa Vista Duplicada"
    }),
    /Ja existe uma loja/
  );
  assert.throws(
    () => structureService.createSellerFromErp({
      tenantId: tenant.id,
      erpSeller: "2 - VENDEDOR EXEMPLO"
    }),
    /Ja existe vendedor/
  );
});

test("parseErpSeller reads CISS seller code and name", () => {
  assert.deepEqual(parseErpSeller("2 - VENDEDOR EXEMPLO"), {
    code: "2",
    name: "VENDEDOR EXEMPLO"
  });
  assert.deepEqual(parseErpSeller("VENDEDOR SEM CODIGO"), {
    code: "",
    name: "VENDEDOR SEM CODIGO"
  });
});

function createFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "commercial-structure-"));
  const store = new CrmDataStore(path.join(dir, "crm.json"));
  store.load();
  const logger = silentLogger();
  return {
    store,
    tenantService: new TenantService(store, logger),
    structureService: new CommercialStructureService(store, logger)
  };
}

function silentLogger() {
  return {
    debug() {},
    info() {},
    warn() {},
    error() {}
  };
}
