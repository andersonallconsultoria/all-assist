export function resolveTenantContext({ request, user, store, config, readCookie }) {
  const hostTenant = resolveTenantFromHost(request.headers.host || "", store, config);
  const isMaster = Boolean(user?.role?.key === "master" || user?.permissions?.includes("support:tenants"));
  const requestedTenantId = readCookie(request, config.saas.activeTenantCookie);
  const requestedTenant = requestedTenantId ? store.findById("tenants", requestedTenantId) : null;
  const userTenant = user?.tenantId ? store.findById("tenants", user.tenantId) : null;

  let activeTenant = userTenant || defaultTenant(store);
  let source = "user";

  if (hostTenant.tenant) {
    activeTenant = hostTenant.tenant;
    source = "host";
  }

  if (isMaster && requestedTenant) {
    activeTenant = requestedTenant;
    source = "master_switch";
  }

  return {
    tenant: activeTenant,
    tenantId: activeTenant?.id || "",
    tenantSlug: activeTenant?.slug || "",
    tenantSource: source,
    hostTenant: hostTenant.tenant,
    hostTenantSlug: hostTenant.slug,
    isMasterDomain: hostTenant.isMasterDomain,
    isUnknownTenantHost: Boolean(hostTenant.slug && !hostTenant.tenant && !hostTenant.isMasterDomain),
    isMaster
  };
}

export function resolveTenantFromHost(hostHeader, store, config) {
  const host = String(hostHeader || "").split(":")[0].toLowerCase();
  const baseDomain = String(config.saas.baseDomain || "").toLowerCase();
  if (!host || !baseDomain) {
    return { slug: "", tenant: null, isMasterDomain: false };
  }

  if (host === baseDomain) {
    return { slug: "", tenant: null, isMasterDomain: false };
  }

  if (!host.endsWith(`.${baseDomain}`)) {
    return { slug: "", tenant: null, isMasterDomain: false };
  }

  const prefix = host.slice(0, -(baseDomain.length + 1));
  const slug = prefix.split(".").at(-1) || "";
  const isMasterDomain = slug === config.saas.masterSubdomain;
  const tenant = isMasterDomain
    ? null
    : store.findOne("tenants", (item) => item.slug === slug) || null;

  return { slug, tenant, isMasterDomain };
}

export function assertTenantAccess(user, context) {
  if (!user) return { ok: false, status: 401, error: "unauthorized" };
  if (context.isMaster) return { ok: true };
  if (context.isUnknownTenantHost) return { ok: false, status: 404, error: "tenant_not_found" };
  if (context.tenant?.status === "blocked" || context.tenant?.billingStatus === "suspended") {
    return { ok: false, status: 403, error: "tenant_blocked" };
  }
  if (context.hostTenant && user.tenantId !== context.hostTenant.id) {
    return { ok: false, status: 403, error: "tenant_access_denied" };
  }
  return { ok: true };
}

export function defaultTenant(store) {
  return store.findOne("tenants", (tenant) => tenant.slug === "default") || store.list("tenants")[0] || null;
}
