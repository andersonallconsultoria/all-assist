const RESERVED_SLUGS = new Set(["admin", "api", "app", "crm", "www", "support", "suporte"]);

export class TenantService {
  constructor(store, logger) {
    this.store = store;
    this.logger = logger;
  }

  listTenants() {
    return this.store
      .list("tenants")
      .map((tenant) => this.withUsage(tenant))
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }

  createTenant(input = {}, actor = {}) {
    const name = String(input.name || "").trim();
    if (!name) throw new Error("Nome da empresa e obrigatorio.");

    const slug = normalizeSlug(input.slug || name);
    validateSlug(slug);

    if (this.store.findOne("tenants", (tenant) => tenant.slug === slug)) {
      throw new Error("Ja existe uma empresa com este subdominio.");
    }

    const tenant = this.store.insert("tenants", {
      name,
      slug,
      status: normalizeStatus(input.status),
      plan: String(input.plan || "starter").trim() || "starter",
      billingStatus: normalizeBillingStatus(input.billingStatus),
      billingEmail: String(input.billingEmail || input.contactEmail || "").trim().toLowerCase(),
      billingDay: numberOrDefault(input.billingDay, 10),
      monthlyBasePrice: numberOrDefault(input.monthlyBasePrice, 0),
      pricePerUser: numberOrDefault(input.pricePerUser, 0),
      userLimit: numberOrDefault(input.userLimit, 3),
      document: String(input.document || "").trim(),
      contactName: String(input.contactName || "").trim(),
      contactEmail: String(input.contactEmail || "").trim().toLowerCase(),
      contactPhone: String(input.contactPhone || "").trim(),
      whatsapp: normalizeWhatsApp(input.whatsapp || input),
      lgpd: normalizeLgpd(input.lgpd || input),
      metadata: {
        createdByUserId: actor.id || ""
      }
    });

    this.logger.info("tenant_created", {
      tenantId: tenant.id,
      slug: tenant.slug,
      userId: actor.id || ""
    });

    return this.withUsage(tenant);
  }

  updateTenant(id, input = {}, actor = {}) {
    const current = this.store.findById("tenants", id);
    if (!current) return null;

    const patch = {
      name: String(input.name ?? current.name).trim(),
      status: normalizeStatus(input.status ?? current.status),
      plan: String(input.plan ?? current.plan ?? "starter").trim() || "starter",
      billingStatus: normalizeBillingStatus(input.billingStatus ?? current.billingStatus),
      billingEmail: String(input.billingEmail ?? current.billingEmail ?? current.contactEmail ?? "").trim().toLowerCase(),
      billingDay: numberOrDefault(input.billingDay ?? current.billingDay, 10),
      monthlyBasePrice: numberOrDefault(input.monthlyBasePrice ?? current.monthlyBasePrice, 0),
      pricePerUser: numberOrDefault(input.pricePerUser ?? current.pricePerUser, 0),
      userLimit: numberOrDefault(input.userLimit ?? current.userLimit, 3),
      document: String(input.document ?? current.document ?? "").trim(),
      contactName: String(input.contactName ?? current.contactName ?? "").trim(),
      contactEmail: String(input.contactEmail ?? current.contactEmail ?? "").trim().toLowerCase(),
      contactPhone: String(input.contactPhone ?? current.contactPhone ?? "").trim(),
      whatsapp: normalizeWhatsApp(input.whatsapp || {
        phoneNumber: input.whatsappPhoneNumber ?? current.whatsapp?.phoneNumber,
        phoneNumberId: input.whatsappPhoneNumberId ?? current.whatsapp?.phoneNumberId,
        businessAccountId: input.whatsappBusinessAccountId ?? current.whatsapp?.businessAccountId,
        status: input.whatsappStatus ?? current.whatsapp?.status
      }),
      lgpd: normalizeLgpd(input.lgpd || {
        dpoName: input.dpoName ?? current.lgpd?.dpoName,
        dpoEmail: input.dpoEmail ?? current.lgpd?.dpoEmail,
        retentionDays: input.retentionDays ?? current.lgpd?.retentionDays,
        consentRequired: input.consentRequired ?? current.lgpd?.consentRequired,
        dataProcessingAgreementSigned: input.dataProcessingAgreementSigned ?? current.lgpd?.dataProcessingAgreementSigned
      })
    };

    if (Object.prototype.hasOwnProperty.call(input, "slug")) {
      const nextSlug = normalizeSlug(input.slug || current.slug);
      validateSlug(nextSlug);
      const duplicate = this.store.findOne("tenants", (tenant) => tenant.slug === nextSlug && tenant.id !== id);
      if (duplicate) throw new Error("Ja existe uma empresa com este subdominio.");
      patch.slug = nextSlug;
    }

    const tenant = this.store.update("tenants", id, {
      ...patch,
      metadata: {
        ...(current.metadata || {}),
        updatedByUserId: actor.id || ""
      }
    });

    this.logger.info("tenant_updated", {
      tenantId: tenant.id,
      slug: tenant.slug,
      userId: actor.id || ""
    });

    return this.withUsage(tenant);
  }

  withUsage(tenant) {
    const users = this.store.list("users").filter((user) => user.tenantId === tenant.id);
    const groups = this.store.list("companyGroups").filter((group) => group.tenantId === tenant.id);
    const companies = this.store.list("tenantCompanies").filter((company) => company.tenantId === tenant.id);
    const salesPeople = this.store.list("salesPeople").filter((person) => person.tenantId === tenant.id);
    const contacts = this.store.list("contacts").filter((contact) => contact.tenantId === tenant.id);
    const deals = this.store.list("deals").filter((deal) => deal.tenantId === tenant.id);
    const conversations = this.store.list("conversations").filter((conversation) => conversation.tenantId === tenant.id);
    const integrationEvents = this.store.list("integrationEvents").filter((event) => event.tenantId === tenant.id);
    const requestMetrics = this.store.list("requestMetrics").filter((metric) => metric.tenantId === tenant.id);
    const auditEvents = this.store.list("auditEvents").filter((event) => event.tenantId === tenant.id);
    const accessCount = auditEvents.filter((event) => event.action === "auth.login").length;
    const activeUsers = users.filter((user) => user.status === "active").length;
    const whatsappMessages = this.store.list("messages").filter((message) => message.tenantId === tenant.id && message.channel === "whatsapp");
    const estimatedMonthlyValue = calculateMonthlyValue(tenant, activeUsers);

    return {
      ...tenant,
      usage: {
        users: users.length,
        activeUsers,
        userLimit: numberOrDefault(tenant.userLimit, 3),
        groups: groups.length,
        companies: companies.length,
        sellers: salesPeople.filter((person) => person.type === "seller").length,
        supervisors: salesPeople.filter((person) => person.type === "supervisor").length,
        contacts: contacts.length,
        deals: deals.length,
        conversations: conversations.length,
        integrationEvents: integrationEvents.length,
        integrationFailures: integrationEvents.filter((event) => event.status === "failed" || event.status === "error").length,
        requests: requestMetrics.length,
        slowRequests: requestMetrics.filter((metric) => metric.slow).length,
        accessCount,
        lastAccessAt: newestDate(auditEvents.filter((event) => event.action === "auth.login")),
        whatsappMessages: whatsappMessages.length,
        estimatedMonthlyValue
      }
    };
  }
}

export function normalizeSlug(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function validateSlug(slug) {
  if (!slug || slug.length < 3) throw new Error("Subdominio deve ter pelo menos 3 caracteres.");
  if (RESERVED_SLUGS.has(slug)) throw new Error("Este subdominio e reservado.");
}

function normalizeStatus(value) {
  const status = String(value || "active").trim().toLowerCase();
  return ["active", "trial", "paused", "blocked", "implantacao", "producao"].includes(status) ? status : "active";
}

function normalizeBillingStatus(value) {
  const status = String(value || "active").trim().toLowerCase();
  return ["active", "trial", "overdue", "suspended", "canceled"].includes(status) ? status : "active";
}

function normalizeWhatsApp(input = {}) {
  return {
    phoneNumber: String(input.phoneNumber || input.whatsappPhoneNumber || "").trim(),
    phoneNumberId: String(input.phoneNumberId || input.whatsappPhoneNumberId || "").trim(),
    businessAccountId: String(input.businessAccountId || input.whatsappBusinessAccountId || "").trim(),
    status: normalizeWhatsAppStatus(input.status || input.whatsappStatus)
  };
}

function normalizeWhatsAppStatus(value) {
  const status = String(value || "not_configured").trim().toLowerCase();
  return ["not_configured", "pending", "connected", "blocked"].includes(status) ? status : "not_configured";
}

function normalizeLgpd(input = {}) {
  return {
    dpoName: String(input.dpoName || "").trim(),
    dpoEmail: String(input.dpoEmail || "").trim().toLowerCase(),
    retentionDays: numberOrDefault(input.retentionDays, 1825),
    consentRequired: booleanFromInput(input.consentRequired, true),
    dataProcessingAgreementSigned: booleanFromInput(input.dataProcessingAgreementSigned, false)
  };
}

function numberOrDefault(value, fallback) {
  const number = Number.parseFloat(String(value ?? "").replace(",", "."));
  return Number.isFinite(number) ? number : fallback;
}

function booleanFromInput(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  return ["1", "true", "yes", "sim", "on"].includes(String(value).toLowerCase());
}

function calculateMonthlyValue(tenant, activeUsers) {
  const base = numberOrDefault(tenant.monthlyBasePrice, 0);
  const pricePerUser = numberOrDefault(tenant.pricePerUser, 0);
  return base + activeUsers * pricePerUser;
}

function newestDate(records) {
  return records
    .map((record) => record.createdAt || record.updatedAt || "")
    .filter(Boolean)
    .sort()
    .at(-1) || "";
}
