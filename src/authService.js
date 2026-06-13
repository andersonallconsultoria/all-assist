import crypto from "node:crypto";

const ALL_PERMISSIONS = [
  "dashboard:view",
  "reports:view",
  "contacts:view",
  "deals:view",
  "deals:write",
  "goals:view",
  "goals:write",
  "conversations:view",
  "conversations:write",
  "products:view",
  "products:write",
  "users:view",
  "users:write",
  "settings:manage",
  "integrations:view",
  "integrations:manage"
];

const MASTER_PERMISSIONS = [
  ...ALL_PERMISSIONS,
  "support:view",
  "support:logs",
  "support:tenants",
  "observability:view"
];

export class AuthService {
  constructor(store, config, logger) {
    this.store = store;
    this.config = config;
    this.logger = logger;
  }

  bootstrap() {
    this.ensureSeedTenants();
    const defaultTenant = this.ensureDefaultTenant();
    let masterRole = this.store.findOne("roles", (role) => role.key === "master");
    if (!masterRole) {
      masterRole = this.store.insert("roles", {
        key: "master",
        name: "Master Neurax CRM",
        description: "Acesso global para suporte, observabilidade e administracao SaaS",
        permissions: MASTER_PERMISSIONS
      });
    }

    let adminRole = this.store.findOne("roles", (role) => role.key === "admin");
    if (!adminRole) {
      adminRole = this.store.insert("roles", {
        key: "admin",
        name: "Administrador",
        description: "Acesso total ao Neurax CRM",
        permissions: ALL_PERMISSIONS
      });
    }

    const sellerRole = this.store.findOne("roles", (role) => role.key === "seller");
    if (!sellerRole) {
      this.store.insert("roles", {
        key: "seller",
        name: "Vendedor",
        description: "Atendimento, conversas e negocios",
        permissions: [
          "dashboard:view",
          "contacts:view",
          "deals:view",
          "deals:write",
          "conversations:view",
          "conversations:write"
        ]
      });
    }

    const adminEmail = this.config.auth.bootstrapAdminEmail.toLowerCase();
    let adminUser = this.store.findOne("users", (user) => user.email === adminEmail);
    if (!adminUser) {
      adminUser = this.createUser({
        name: this.config.auth.bootstrapAdminName,
        email: adminEmail,
        password: this.config.auth.bootstrapAdminPassword,
        roleId: adminRole.id,
        tenantId: defaultTenant.id,
        status: "active"
      });
      this.logger.warn("auth_bootstrap_admin_created", {
        email: adminEmail,
        message: "Change NEURAXCRM_BOOTSTRAP_ADMIN_PASSWORD before production"
      });
    }

    const masterEmail = String(this.config.auth.bootstrapMasterEmail || "").trim().toLowerCase();
    if (masterEmail) {
      let masterUser = this.store.findOne("users", (user) => user.email === masterEmail);
      if (!masterUser) {
        masterUser = this.createUser({
          name: this.config.auth.bootstrapMasterName || "Suporte Neurax",
          email: masterEmail,
          password: this.config.auth.bootstrapMasterPassword,
          roleId: masterRole.id,
          tenantId: defaultTenant.id,
          status: "active"
        });
        this.logger.warn("auth_bootstrap_master_created", {
          email: masterEmail,
          message: "Change NEURAXCRM_BOOTSTRAP_MASTER_PASSWORD before production"
        });
      }
    }

    this.store.save();
    return this.getUserWithRole(adminUser.id);
  }

  ensureSeedTenants() {
    const seeds = this.config.seedTenants || [];
    for (const seed of seeds) {
      if (!seed.slug) continue;
      const exists = this.store.findOne("tenants", (t) => t.slug === seed.slug);
      if (!exists) {
        this.store.insert("tenants", {
          name: seed.name || seed.slug,
          slug: seed.slug,
          status: seed.status || "active",
          plan: seed.plan || "starter",
          billingStatus: seed.billingStatus || "active",
          billingEmail: seed.billingEmail || "",
          billingDay: seed.billingDay || 10,
          monthlyBasePrice: seed.monthlyBasePrice || 0,
          pricePerUser: seed.pricePerUser || 0,
          userLimit: seed.userLimit || 5,
          document: seed.document || "",
          contactName: seed.contactName || "",
          whatsapp: { phoneNumber: "", phoneNumberId: "", businessAccountId: "", status: "not_configured" },
          lgpd: { dpoName: "", dpoEmail: "", retentionDays: 1825, consentRequired: true, dataProcessingAgreementSigned: false },
          metadata: { source: "seed" }
        });
        this.logger.warn("auth_bootstrap_seed_tenant_created", { slug: seed.slug });
      }
    }
  }

  ensureDefaultTenant() {
    let tenant = this.store.findOne("tenants", (item) => item.slug === "default");
    if (!tenant) {
      tenant = this.store.insert("tenants", {
        id: "tenant_default",
        name: "Cliente Padrao",
        slug: "default",
        status: "active",
        plan: "internal",
        metadata: {
          source: "bootstrap"
        }
      });
    }
    return tenant;
  }

  createUser({ name, email, password, roleId, tenantId = "", status = "active", emailVerifiedAt = "", accessScope = null }) {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail) throw new Error("Email obrigatorio");
    if (!password || String(password).length < 6) throw new Error("Senha deve ter pelo menos 6 caracteres");
    if (this.store.findOne("users", (user) => user.email === normalizedEmail)) {
      throw new Error("Usuario ja existe");
    }

    return this.store.insert("users", {
      name: String(name || normalizedEmail).trim(),
      email: normalizedEmail,
      passwordHash: hashPassword(password),
      roleId,
      tenantId: tenantId || this.ensureDefaultTenant().id,
      status,
      emailVerifiedAt,
      accessScope,
      lastLoginAt: ""
    });
  }

  authenticate(email, password) {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const user = this.store.findOne("users", (item) => item.email === normalizedEmail);
    if (!user || user.status !== "active") return null;
    if (!verifyPassword(password, user.passwordHash)) return null;

    this.store.update("users", user.id, {
      lastLoginAt: new Date().toISOString()
    });

    return this.createSession(user.id);
  }

  createSession(userId) {
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + this.config.auth.sessionTtlHours * 60 * 60 * 1000).toISOString();
    const tokenHash = hashToken(token, this.config.auth.sessionSecret);

    const session = this.store.insert("sessions", {
      tokenHash,
      userId,
      expiresAt,
      revokedAt: ""
    });

    this.store.save();
    return {
      token,
      session,
      user: this.getUserWithRole(userId)
    };
  }

  getSessionUser(token) {
    if (!token) return null;
    const tokenHash = hashToken(token, this.config.auth.sessionSecret);
    const session = this.store.findOne("sessions", (item) => item.tokenHash === tokenHash && !item.revokedAt);
    if (!session) return null;
    if (Date.parse(session.expiresAt) < Date.now()) return null;

    return this.getUserWithRole(session.userId);
  }

  revokeSession(token) {
    if (!token) return;
    const tokenHash = hashToken(token, this.config.auth.sessionSecret);
    const session = this.store.findOne("sessions", (item) => item.tokenHash === tokenHash && !item.revokedAt);
    if (session) {
      this.store.update("sessions", session.id, {
        revokedAt: new Date().toISOString()
      });
      this.store.save();
    }
  }

  getUserWithRole(userId) {
    const user = this.store.findById("users", userId);
    if (!user) return null;
    const role = this.store.findById("roles", user.roleId);
    const tenant = this.store.findById("tenants", user.tenantId);
    return sanitizeUser({
      ...user,
      role,
      tenant,
      permissions: role?.permissions || []
    });
  }

  listUsers({ tenantId = "", includeAll = false } = {}) {
    return this.store
      .list("users")
      .filter((user) => includeAll || !tenantId || user.tenantId === tenantId)
      .map((user) => this.getUserWithRole(user.id));
  }

  listRoles() {
    return this.store.list("roles");
  }

  hasPermission(user, permission) {
    return Boolean(user?.permissions?.includes(permission));
  }

  isMaster(user) {
    return user?.role?.key === "master" || this.hasPermission(user, "support:tenants");
  }
}

export function sanitizeUser(user) {
  if (!user) return null;
  const { passwordHash, ...safe } = user;
  return safe;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password, passwordHash) {
  const [algorithm, salt, expected] = String(passwordHash || "").split(":");
  if (algorithm !== "scrypt" || !salt || !expected) return false;
  const actual = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}

function hashToken(token, secret) {
  return crypto
    .createHmac("sha256", secret)
    .update(token)
    .digest("hex");
}
