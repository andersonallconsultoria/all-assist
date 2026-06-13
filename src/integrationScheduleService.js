const DEFAULT_SCHEDULES = {
  orders: {
    label: "Pedidos e orcamentos",
    enabled: true,
    intervalMinutes: 1,
    strategy: "incremental",
    cursorField: "dtalteracao",
    onlineLookup: false,
    cacheTtlSeconds: 0
  },
  products: {
    label: "Produtos",
    enabled: false,
    intervalMinutes: 10,
    strategy: "full_then_incremental",
    cursorField: "dtalteracao",
    onlineLookup: false,
    cacheTtlSeconds: 0
  },
  stock: {
    label: "Estoque",
    enabled: true,
    intervalMinutes: 0,
    strategy: "online",
    cursorField: "",
    onlineLookup: true,
    cacheTtlSeconds: 60
  },
  customers: {
    label: "Clientes",
    enabled: false,
    intervalMinutes: 10,
    strategy: "incremental",
    cursorField: "dtalteracao",
    onlineLookup: false,
    cacheTtlSeconds: 0
  },
  sellers: {
    label: "Vendedores",
    enabled: false,
    intervalMinutes: 60,
    strategy: "incremental",
    cursorField: "dtalteracao",
    onlineLookup: false,
    cacheTtlSeconds: 0
  }
};

const VALID_STRATEGIES = new Set(["incremental", "full_then_incremental", "full", "online"]);

export class IntegrationScheduleService {
  constructor(store, logger = noopLogger()) {
    this.store = store;
    this.logger = logger;
  }

  listSchedules(tenantId) {
    this.requireTenant(tenantId);
    return Object.keys(DEFAULT_SCHEDULES).map((entityType) => this.getSchedule(tenantId, entityType));
  }

  getSchedule(tenantId, entityType) {
    this.requireTenant(tenantId);
    const normalizedType = normalizeEntityType(entityType);
    const current = this.store.findOne("integrationSchedules", (schedule) => (
      schedule.tenantId === tenantId && schedule.entityType === normalizedType
    ));
    return current || this.buildDefaultSchedule(tenantId, normalizedType);
  }

  updateSchedule(tenantId, entityType, input = {}, actor = {}) {
    this.requireTenant(tenantId);
    const normalizedType = normalizeEntityType(entityType);
    const current = this.store.findOne("integrationSchedules", (schedule) => (
      schedule.tenantId === tenantId && schedule.entityType === normalizedType
    ));
    const base = current || this.buildDefaultSchedule(tenantId, normalizedType);
    const patch = normalizeSchedule({
      ...base,
      ...input,
      tenantId,
      entityType: normalizedType
    });

    const schedule = current
      ? this.store.update("integrationSchedules", current.id, {
        ...patch,
        metadata: {
          ...(current.metadata || {}),
          updatedByUserId: actor.id || ""
        }
      })
      : this.store.insert("integrationSchedules", {
        ...patch,
        metadata: {
          createdByUserId: actor.id || ""
        }
      });

    this.logger.info("integration_schedule_updated", {
      tenantId,
      entityType: normalizedType,
      intervalMinutes: schedule.intervalMinutes,
      strategy: schedule.strategy
    });

    return schedule;
  }

  shouldRun(schedule, now = new Date()) {
    if (!schedule?.enabled) return false;
    if (schedule.strategy === "online") return false;
    const intervalMinutes = Number(schedule.intervalMinutes || 0);
    if (intervalMinutes <= 0) return false;
    const lastRunAt = schedule.lastRunAt || "";
    if (!lastRunAt) return true;
    return Date.parse(lastRunAt) + intervalMinutes * 60 * 1000 <= now.getTime();
  }

  markRun(tenantId, entityType, { status = "success", cursorValue = "", fullSync = false } = {}) {
    const schedule = this.getSchedule(tenantId, entityType);
    const now = new Date().toISOString();
    return this.updateSchedule(tenantId, entityType, {
      ...schedule,
      lastRunAt: now,
      lastStatus: status,
      lastCursorValue: cursorValue || schedule.lastCursorValue || "",
      lastFullSyncAt: fullSync ? now : schedule.lastFullSyncAt || ""
    });
  }

  buildDefaultSchedule(tenantId, entityType) {
    const defaults = DEFAULT_SCHEDULES[entityType];
    if (!defaults) throw new Error("Tipo de integracao nao suportado.");
    return normalizeSchedule({
      tenantId,
      entityType,
      ...defaults,
      lastRunAt: "",
      lastStatus: "",
      lastCursorValue: "",
      lastFullSyncAt: ""
    });
  }

  requireTenant(tenantId) {
    const tenant = this.store.findById("tenants", tenantId);
    if (!tenant) throw new Error("Cliente SaaS nao encontrado.");
    return tenant;
  }
}

export function scheduleDefaults() {
  return DEFAULT_SCHEDULES;
}

function normalizeSchedule(input = {}) {
  const entityType = normalizeEntityType(input.entityType);
  const defaults = DEFAULT_SCHEDULES[entityType];
  const strategy = normalizeStrategy(input.strategy || defaults.strategy);
  const intervalMinutes = normalizeInterval(input.intervalMinutes, strategy);

  return {
    tenantId: text(input.tenantId),
    entityType,
    label: text(input.label || defaults.label),
    enabled: booleanFromInput(input.enabled, defaults.enabled),
    intervalMinutes,
    strategy,
    cursorField: text(input.cursorField ?? defaults.cursorField),
    onlineLookup: booleanFromInput(input.onlineLookup, defaults.onlineLookup),
    cacheTtlSeconds: normalizeCache(input.cacheTtlSeconds, strategy),
    lastRunAt: text(input.lastRunAt),
    lastStatus: text(input.lastStatus),
    lastCursorValue: text(input.lastCursorValue),
    lastFullSyncAt: text(input.lastFullSyncAt)
  };
}

function normalizeEntityType(value) {
  const entityType = text(value || "").toLowerCase();
  if (!DEFAULT_SCHEDULES[entityType]) throw new Error("Tipo de integracao nao suportado.");
  return entityType;
}

function normalizeStrategy(value) {
  const strategy = text(value || "incremental").toLowerCase();
  return VALID_STRATEGIES.has(strategy) ? strategy : "incremental";
}

function normalizeInterval(value, strategy) {
  if (strategy === "online") return 0;
  const number = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(number) || number <= 0) return 1;
  return Math.max(1, Math.min(number, 1440));
}

function normalizeCache(value, strategy) {
  const number = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(number) || number < 0) return strategy === "online" ? 60 : 0;
  return Math.min(number, 3600);
}

function booleanFromInput(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  return ["1", "true", "yes", "sim", "on"].includes(String(value).toLowerCase());
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
