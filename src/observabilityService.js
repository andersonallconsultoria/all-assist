export class ObservabilityService {
  constructor(store, config, logger) {
    this.store = store;
    this.config = config;
    this.logger = logger;
    this.requestSlowMs = Number.parseInt(process.env.ALLASSIST_SLOW_REQUEST_MS || "1000", 10);
    this.maxRecords = Number.parseInt(process.env.ALLASSIST_OBSERVABILITY_MAX_RECORDS || "1000", 10);
  }

  recordAudit({ tenantId = "", userId = "", action, entityType = "", entityId = "", metadata = {} }) {
    const event = this.store.insert("auditEvents", {
      tenantId: tenantId || defaultTenantId(this.store),
      userId,
      action,
      entityType,
      entityId,
      metadata
    });
    this.trim("auditEvents");
    return event;
  }

  recordIntegrationEvent({
    tenantId = "",
    runId = "",
    provider = "erp",
    sourceKey = "",
    status = "info",
    action = "",
    message = "",
    durationMs = 0,
    metadata = {},
    error = ""
  }) {
    const event = this.store.insert("integrationEvents", {
      tenantId: tenantId || defaultTenantId(this.store),
      runId,
      provider,
      sourceKey,
      status,
      action,
      message,
      durationMs,
      metadata,
      error
    });
    this.trim("integrationEvents");
    return event;
  }

  recordRequest({ tenantId = "", userId = "", method, path, statusCode, durationMs, ip = "", userAgent = "" }) {
    if (!path.startsWith("/api/") && !path.startsWith("/webhooks/")) return null;
    const metric = this.store.insert("requestMetrics", {
      tenantId: tenantId || defaultTenantId(this.store),
      userId,
      method,
      path,
      statusCode,
      durationMs,
      slow: durationMs >= this.requestSlowMs,
      ip,
      userAgent
    });
    this.trim("requestMetrics");
    return metric;
  }

  getSupportOverview() {
    const tenants = this.store.list("tenants");
    const users = this.store.list("users");
    const contacts = this.store.list("contacts");
    const deals = this.store.list("deals");
    const syncRuns = newest(this.store.list("syncRuns"), 8);
    const integrationEvents = newest(this.store.list("integrationEvents"), 80);
    const requestMetrics = newest(this.store.list("requestMetrics"), 250);
    const failedIntegrationEvents = integrationEvents.filter((event) => event.status === "failed" || event.status === "error");
    const slowRequests = requestMetrics.filter((metric) => metric.slow).slice(0, 12);

    return {
      generatedAt: new Date().toISOString(),
      summary: {
        tenants: tenants.length,
        activeTenants: tenants.filter((tenant) => tenant.status === "active").length,
        users: users.length,
        contacts: contacts.length,
        deals: deals.length,
        integrationFailures: failedIntegrationEvents.length,
        slowRequests: slowRequests.length
      },
      tenants: tenants.map((tenant) => ({
        ...tenant,
        users: users.filter((user) => user.tenantId === tenant.id).length,
        contacts: contacts.filter((contact) => contact.tenantId === tenant.id).length,
        deals: deals.filter((deal) => deal.tenantId === tenant.id).length
      })),
      latestSyncRuns: syncRuns,
      recentIntegrationEvents: integrationEvents.slice(0, 30),
      recentErrors: failedIntegrationEvents.slice(0, 15),
      slowRequests,
      requestStats: buildRequestStats(requestMetrics)
    };
  }

  listIntegrationEvents({ limit = 100 } = {}) {
    return newest(this.store.list("integrationEvents"), limit);
  }

  listAuditEvents({ limit = 100 } = {}) {
    return newest(this.store.list("auditEvents"), limit);
  }

  listRequestMetrics({ limit = 100 } = {}) {
    return newest(this.store.list("requestMetrics"), limit);
  }

  trim(collection) {
    const records = this.store.list(collection);
    if (records.length <= this.maxRecords) return;
    this.store.data[collection] = newest(records, this.maxRecords).reverse();
  }
}

function buildRequestStats(metrics) {
  const byPath = new Map();
  for (const metric of metrics) {
    const key = `${metric.method} ${metric.path}`;
    const item = byPath.get(key) || {
      route: key,
      count: 0,
      errors: 0,
      slow: 0,
      totalDurationMs: 0,
      maxDurationMs: 0
    };
    item.count += 1;
    item.errors += Number(metric.statusCode || 0) >= 500 ? 1 : 0;
    item.slow += metric.slow ? 1 : 0;
    item.totalDurationMs += Number(metric.durationMs || 0);
    item.maxDurationMs = Math.max(item.maxDurationMs, Number(metric.durationMs || 0));
    byPath.set(key, item);
  }

  return [...byPath.values()]
    .map((item) => ({
      ...item,
      avgDurationMs: Math.round(item.totalDurationMs / Math.max(1, item.count))
    }))
    .sort((a, b) => b.avgDurationMs - a.avgDurationMs)
    .slice(0, 20);
}

function newest(records, limit) {
  return [...records]
    .sort((a, b) => String(b.createdAt || b.updatedAt || "").localeCompare(String(a.createdAt || a.updatedAt || "")))
    .slice(0, Number(limit || 100));
}

function defaultTenantId(store) {
  return store.list("tenants")[0]?.id || "tenant_default";
}
