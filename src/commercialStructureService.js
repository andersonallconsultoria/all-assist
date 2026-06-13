import { normalizeSlug } from "./tenantService.js";

const GROUP_STATUSES = new Set(["active", "inactive"]);
const COMPANY_STATUSES = new Set(["active", "inactive"]);
const PERSON_TYPES = new Set(["seller", "supervisor"]);
const PERSON_STATUSES = new Set(["active", "inactive"]);
const SCOPE_MODES = new Set(["tenant", "groups", "companies", "seller"]);

export class CommercialStructureService {
  constructor(store, logger = noopLogger()) {
    this.store = store;
    this.logger = logger;
  }

  createCompanyGroup(input = {}, actor = {}) {
    const tenant = this.requireTenant(input.tenantId);
    const name = requiredText(input.name, "Nome do grupo e obrigatorio.");
    const slug = normalizeSlug(input.slug || name);
    if (!slug) throw new Error("Slug do grupo e obrigatorio.");

    const duplicate = this.store.findOne("companyGroups", (group) => (
      group.tenantId === tenant.id && group.slug === slug
    ));
    if (duplicate) throw new Error("Ja existe um grupo com este slug.");

    const group = this.store.insert("companyGroups", {
      tenantId: tenant.id,
      name,
      slug,
      description: text(input.description),
      status: normalizeFromSet(input.status, GROUP_STATUSES, "active"),
      metadata: {
        createdByUserId: actor.id || ""
      }
    });

    this.logger.info("company_group_created", {
      tenantId: tenant.id,
      groupId: group.id,
      slug: group.slug
    });

    return group;
  }

  getTenantStructure(tenantId) {
    const tenant = this.requireTenant(tenantId);
    const groups = this.store.list("companyGroups").filter((group) => group.tenantId === tenant.id);
    const companies = this.store.list("tenantCompanies").filter((company) => company.tenantId === tenant.id);
    const salesPeople = this.store.list("salesPeople").filter((person) => person.tenantId === tenant.id);

    return {
      tenant,
      groups,
      companies,
      salesPeople
    };
  }

  createCompany(input = {}, actor = {}) {
    const tenant = this.requireTenant(input.tenantId);
    const group = this.requireGroup(input.groupId, tenant.id);
    const erpCompanyId = requiredText(input.erpCompanyId ?? input.idempresa, "Codigo da empresa no ERP e obrigatorio.");

    const duplicate = this.store.findOne("tenantCompanies", (company) => (
      company.tenantId === tenant.id && String(company.erpCompanyId) === String(erpCompanyId)
    ));
    if (duplicate) throw new Error("Ja existe uma loja com este codigo do ERP.");

    const company = this.store.insert("tenantCompanies", {
      tenantId: tenant.id,
      groupId: group.id,
      erpCompanyId,
      legalName: requiredText(input.legalName || input.name || input.tradeName, "Razao social e obrigatoria."),
      tradeName: text(input.tradeName || input.name || input.legalName),
      document: digits(input.document || input.cnpj || input.cnpjcpf),
      city: text(input.city || input.descrcidade),
      state: text(input.state || input.uf).toUpperCase(),
      status: normalizeFromSet(input.status, COMPANY_STATUSES, "active"),
      metadata: {
        createdByUserId: actor.id || ""
      }
    });

    this.logger.info("tenant_company_created", {
      tenantId: tenant.id,
      groupId: group.id,
      companyId: company.id,
      erpCompanyId: company.erpCompanyId
    });

    return company;
  }

  createSalesPerson(input = {}, actor = {}) {
    const tenant = this.requireTenant(input.tenantId);
    const type = normalizeFromSet(input.type, PERSON_TYPES, "seller");
    const erpSeller = parseErpSeller(input.erpSeller || input.vendedores || "");
    const erpCode = text(input.erpCode || erpSeller.code);
    const name = requiredText(input.name || erpSeller.name, "Nome do vendedor/supervisor e obrigatorio.");
    const userId = text(input.userId);
    const supervisorId = text(input.supervisorId);

    if (userId) this.requireTenantUser(userId, tenant.id);
    if (supervisorId) {
      const supervisor = this.requireSalesPerson(supervisorId, tenant.id);
      if (supervisor.type !== "supervisor") throw new Error("Supervisor informado nao possui perfil de supervisor.");
    }

    if (type === "seller" && erpCode) {
      const duplicate = this.store.findOne("salesPeople", (person) => (
        person.tenantId === tenant.id
        && person.type === "seller"
        && String(person.erpCode) === String(erpCode)
      ));
      if (duplicate) throw new Error("Ja existe vendedor com este codigo ERP.");
    }

    const groupIds = this.normalizeGroupIds(input.groupIds, tenant.id);
    const companyIds = this.normalizeCompanyIds(input.companyIds, tenant.id);

    const person = this.store.insert("salesPeople", {
      tenantId: tenant.id,
      type,
      erpCode,
      name,
      email: text(input.email).toLowerCase(),
      userId,
      supervisorId,
      groupIds,
      companyIds,
      status: normalizeFromSet(input.status, PERSON_STATUSES, "active"),
      metadata: {
        createdByUserId: actor.id || ""
      }
    });

    this.logger.info("sales_person_created", {
      tenantId: tenant.id,
      salesPersonId: person.id,
      type: person.type,
      erpCode: person.erpCode
    });

    return person;
  }

  createSellerFromErp(input = {}, actor = {}) {
    return this.createSalesPerson({
      ...input,
      type: "seller"
    }, actor);
  }

  setUserScope(userId, input = {}, actor = {}) {
    const user = this.store.findById("users", userId);
    if (!user) throw new Error("Usuario nao encontrado.");

    const tenant = this.requireTenant(input.tenantId || user.tenantId);
    if (user.tenantId && user.tenantId !== tenant.id) throw new Error("Usuario pertence a outro cliente SaaS.");

    const mode = normalizeFromSet(input.mode, SCOPE_MODES, "tenant");
    const groupIds = this.normalizeGroupIds(input.groupIds, tenant.id);
    const companyIds = this.normalizeCompanyIds(input.companyIds, tenant.id);
    const sellerProfileId = text(input.sellerProfileId);

    if (sellerProfileId) {
      const seller = this.requireSalesPerson(sellerProfileId, tenant.id);
      if (seller.type !== "seller") throw new Error("Perfil comercial informado nao e vendedor.");
    }

    const accessScope = {
      mode,
      groupIds,
      companyIds,
      sellerProfileId,
      updatedByUserId: actor.id || "",
      updatedAt: new Date().toISOString()
    };

    return this.store.update("users", userId, {
      tenantId: tenant.id,
      accessScope
    });
  }

  canAccessCompany(user, companyId) {
    const company = this.store.findById("tenantCompanies", companyId);
    if (!company || !user) return false;
    if (isMasterUser(user)) return true;
    if (user.tenantId !== company.tenantId) return false;

    const scope = user.accessScope || { mode: "tenant" };
    if (scope.mode === "tenant") return true;
    if (scope.mode === "groups") return arrayIncludes(scope.groupIds, company.groupId);
    if (scope.mode === "companies") return arrayIncludes(scope.companyIds, company.id);
    if (scope.mode === "seller") {
      const seller = this.store.findById("salesPeople", scope.sellerProfileId);
      if (!seller || seller.tenantId !== company.tenantId) return false;
      if (seller.companyIds?.length) return arrayIncludes(seller.companyIds, company.id);
      if (seller.groupIds?.length) return arrayIncludes(seller.groupIds, company.groupId);
      return true;
    }
    return false;
  }

  listAccessibleCompanies(user) {
    return this.store
      .list("tenantCompanies")
      .filter((company) => this.canAccessCompany(user, company.id));
  }

  listSellersForSupervisor(supervisorId) {
    const supervisor = this.store.findById("salesPeople", supervisorId);
    if (!supervisor || supervisor.type !== "supervisor") return [];

    return this.store
      .list("salesPeople")
      .filter((person) => (
        person.tenantId === supervisor.tenantId
        && person.type === "seller"
        && person.supervisorId === supervisor.id
      ));
  }

  resolveRecordScope(tenantId, record = {}) {
    const tenant = this.requireTenant(tenantId);
    const erpCompanyId = text(record.idempresa ?? record.erpCompanyId);
    const erpSeller = parseErpSeller(record.vendedores || record.erpSeller || "");

    const company = erpCompanyId
      ? this.store.findOne("tenantCompanies", (item) => (
        item.tenantId === tenant.id && String(item.erpCompanyId) === String(erpCompanyId)
      ))
      : null;
    const group = company ? this.store.findById("companyGroups", company.groupId) : null;
    const seller = erpSeller.code
      ? this.store.findOne("salesPeople", (item) => (
        item.tenantId === tenant.id && item.type === "seller" && String(item.erpCode) === String(erpSeller.code)
      ))
      : null;
    const supervisor = seller?.supervisorId
      ? this.store.findById("salesPeople", seller.supervisorId)
      : null;

    return {
      tenant,
      group,
      company,
      seller,
      supervisor,
      erpSeller
    };
  }

  requireTenant(tenantId) {
    const tenant = this.store.findById("tenants", tenantId);
    if (!tenant) throw new Error("Cliente SaaS nao encontrado.");
    return tenant;
  }

  requireGroup(groupId, tenantId) {
    const group = this.store.findById("companyGroups", groupId);
    if (!group || group.tenantId !== tenantId) throw new Error("Grupo de empresas nao encontrado.");
    return group;
  }

  requireCompany(companyId, tenantId) {
    const company = this.store.findById("tenantCompanies", companyId);
    if (!company || company.tenantId !== tenantId) throw new Error("Empresa/CNPJ nao encontrado.");
    return company;
  }

  requireSalesPerson(personId, tenantId) {
    const person = this.store.findById("salesPeople", personId);
    if (!person || person.tenantId !== tenantId) throw new Error("Pessoa comercial nao encontrada.");
    return person;
  }

  requireTenantUser(userId, tenantId) {
    const user = this.store.findById("users", userId);
    if (!user || user.tenantId !== tenantId) throw new Error("Usuario nao encontrado neste cliente SaaS.");
    return user;
  }

  normalizeGroupIds(groupIds = [], tenantId) {
    return uniqueArray(groupIds).map((groupId) => this.requireGroup(groupId, tenantId).id);
  }

  normalizeCompanyIds(companyIds = [], tenantId) {
    return uniqueArray(companyIds).map((companyId) => this.requireCompany(companyId, tenantId).id);
  }
}

export function parseErpSeller(value = "") {
  const textValue = text(value);
  const match = textValue.match(/^(\d+)\s*-\s*(.+)$/);
  if (!match) {
    return {
      code: "",
      name: textValue
    };
  }

  return {
    code: match[1],
    name: text(match[2])
  };
}

function requiredText(value, message) {
  const normalized = text(value);
  if (!normalized) throw new Error(message);
  return normalized;
}

function text(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function digits(value) {
  return text(value).replace(/\D+/g, "");
}

function normalizeFromSet(value, allowed, fallback) {
  const normalized = text(value || fallback).toLowerCase();
  return allowed.has(normalized) ? normalized : fallback;
}

function uniqueArray(values = []) {
  return [...new Set((Array.isArray(values) ? values : [values]).filter(Boolean).map(String))];
}

function arrayIncludes(values = [], value) {
  return values.map(String).includes(String(value));
}

function isMasterUser(user) {
  return user?.role?.key === "master" || user?.permissions?.includes("support:tenants");
}

function noopLogger() {
  return {
    info() {},
    warn() {},
    error() {}
  };
}
