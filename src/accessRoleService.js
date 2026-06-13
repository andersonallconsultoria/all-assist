import { normalizeSlug } from "./tenantService.js";

export const PERMISSION_CATALOG = [
  {
    module: "inicio",
    name: "Inicio",
    permissions: ["dashboard:view"]
  },
  {
    module: "relatorios",
    name: "Relatorios",
    permissions: ["reports:view"]
  },
  {
    module: "crm",
    name: "CRM",
    permissions: ["contacts:view", "deals:view", "deals:write", "goals:view", "goals:write"]
  },
  {
    module: "conversas",
    name: "Conversas WhatsApp",
    permissions: ["conversations:view", "conversations:write"]
  },
  {
    module: "produtos",
    name: "Produtos e estoque",
    permissions: ["products:view", "products:write"]
  },
  {
    module: "usuarios",
    name: "Usuarios e cargos",
    permissions: ["users:view", "users:write"]
  },
  {
    module: "integracoes",
    name: "Integracoes ERP",
    permissions: ["settings:manage", "integrations:view", "integrations:manage"]
  }
];

const ROLE_TYPES = new Set(["admin", "supervisor", "seller", "operator", "custom"]);
const ALL_PERMISSIONS = new Set(PERMISSION_CATALOG.flatMap((item) => item.permissions));

export class AccessRoleService {
  constructor(store, logger = noopLogger()) {
    this.store = store;
    this.logger = logger;
  }

  listPermissionCatalog() {
    return PERMISSION_CATALOG;
  }

  createRole(input = {}, actor = {}) {
    const tenantId = requiredText(input.tenantId, "Cliente SaaS e obrigatorio.");
    const tenant = this.store.findById("tenants", tenantId);
    if (!tenant) throw new Error("Cliente SaaS nao encontrado.");

    const name = requiredText(input.name, "Nome do cargo e obrigatorio.");
    const type = normalizeRoleType(input.type);
    const permissions = normalizePermissions(input.permissions);
    const key = `tenant:${tenant.id}:${normalizeSlug(input.key || name)}`;

    const duplicate = this.store.findOne("roles", (role) => (
      role.tenantId === tenant.id
      && (role.key === key || role.name.toLowerCase() === name.toLowerCase())
    ));
    if (duplicate) throw new Error("Ja existe um cargo com este nome.");

    const role = this.store.insert("roles", {
      tenantId: tenant.id,
      key,
      name,
      type,
      description: text(input.description),
      permissions,
      isSystem: false,
      metadata: {
        createdByUserId: actor.id || ""
      }
    });

    this.logger.info("access_role_created", {
      tenantId: tenant.id,
      roleId: role.id,
      type: role.type
    });

    return role;
  }

  updateRole(roleId, input = {}, actor = {}) {
    const current = this.store.findById("roles", roleId);
    if (!current || !current.tenantId) throw new Error("Cargo nao encontrado.");

    const patch = {
      name: requiredText(input.name ?? current.name, "Nome do cargo e obrigatorio."),
      type: normalizeRoleType(input.type ?? current.type),
      description: text(input.description ?? current.description),
      permissions: normalizePermissions(input.permissions ?? current.permissions),
      metadata: {
        ...(current.metadata || {}),
        updatedByUserId: actor.id || ""
      }
    };

    return this.store.update("roles", roleId, patch);
  }

  listRoles({ tenantId = "", includeSystem = true } = {}) {
    return this.store
      .list("roles")
      .filter((role) => (
        (includeSystem && !role.tenantId)
        || (tenantId && role.tenantId === tenantId)
      ))
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }
}

function normalizeRoleType(value) {
  const type = text(value || "custom").toLowerCase();
  return ROLE_TYPES.has(type) ? type : "custom";
}

function normalizePermissions(values = []) {
  const permissions = [...new Set((Array.isArray(values) ? values : [values]).filter(Boolean).map(String))];
  const unknown = permissions.filter((permission) => !ALL_PERMISSIONS.has(permission));
  if (unknown.length) throw new Error(`Permissoes desconhecidas: ${unknown.join(", ")}`);
  return permissions;
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

function noopLogger() {
  return {
    info() {},
    warn() {},
    error() {}
  };
}
