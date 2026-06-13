import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { CrmDataStore } from "../src/crmDataStore.js";
import { IntegrationScheduleService } from "../src/integrationScheduleService.js";
import { TenantService } from "../src/tenantService.js";

test("IntegrationScheduleService provides safe default schedules per tenant", () => {
  const { tenant, scheduleService } = createFixture();

  const schedules = scheduleService.listSchedules(tenant.id);
  const orders = schedules.find((item) => item.entityType === "orders");
  const products = schedules.find((item) => item.entityType === "products");
  const stock = schedules.find((item) => item.entityType === "stock");

  assert.equal(schedules.length, 5);
  assert.equal(orders.intervalMinutes, 1);
  assert.equal(orders.enabled, true);
  assert.equal(products.intervalMinutes, 10);
  assert.equal(products.strategy, "full_then_incremental");
  assert.equal(stock.strategy, "online");
  assert.equal(stock.intervalMinutes, 0);
  assert.equal(stock.onlineLookup, true);
  assert.equal(stock.cacheTtlSeconds, 60);
});

test("IntegrationScheduleService updates products and stock cadence", () => {
  const { tenant, scheduleService, store } = createFixture();

  const products = scheduleService.updateSchedule(tenant.id, "products", {
    enabled: true,
    intervalMinutes: 15,
    strategy: "full_then_incremental",
    cursorField: "dtalteracao"
  });
  const stock = scheduleService.updateSchedule(tenant.id, "stock", {
    strategy: "online",
    cacheTtlSeconds: 120
  });

  assert.equal(products.enabled, true);
  assert.equal(products.intervalMinutes, 15);
  assert.equal(products.cursorField, "dtalteracao");
  assert.equal(stock.intervalMinutes, 0);
  assert.equal(stock.cacheTtlSeconds, 120);
  assert.equal(store.list("integrationSchedules").length, 2);
});

test("IntegrationScheduleService decides when a scheduled integration should run", () => {
  const { tenant, scheduleService } = createFixture();
  const now = new Date("2026-04-22T10:00:00.000Z");

  const neverRan = scheduleService.updateSchedule(tenant.id, "orders", {
    enabled: true,
    intervalMinutes: 1,
    lastRunAt: ""
  });
  const recent = scheduleService.updateSchedule(tenant.id, "products", {
    enabled: true,
    intervalMinutes: 10,
    lastRunAt: "2026-04-22T09:55:00.000Z"
  });
  const due = scheduleService.updateSchedule(tenant.id, "customers", {
    enabled: true,
    intervalMinutes: 10,
    lastRunAt: "2026-04-22T09:49:00.000Z"
  });
  const online = scheduleService.updateSchedule(tenant.id, "stock", {
    enabled: true,
    strategy: "online"
  });

  assert.equal(scheduleService.shouldRun(neverRan, now), true);
  assert.equal(scheduleService.shouldRun(recent, now), false);
  assert.equal(scheduleService.shouldRun(due, now), true);
  assert.equal(scheduleService.shouldRun(online, now), false);
});

test("IntegrationScheduleService marks runs and keeps cursor data", () => {
  const { tenant, scheduleService } = createFixture();

  const updated = scheduleService.markRun(tenant.id, "products", {
    status: "success",
    cursorValue: "2026-04-22T09:59:00.000Z",
    fullSync: true
  });

  assert.equal(updated.lastStatus, "success");
  assert.equal(updated.lastCursorValue, "2026-04-22T09:59:00.000Z");
  assert.ok(updated.lastRunAt);
  assert.ok(updated.lastFullSyncAt);
});

function createFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "integration-schedule-"));
  const store = new CrmDataStore(path.join(dir, "crm.json"));
  store.load();
  const logger = silentLogger();
  const tenantService = new TenantService(store, logger);
  const tenant = tenantService.createTenant({ name: "Cliente Agenda", slug: "cliente-agenda" });
  const scheduleService = new IntegrationScheduleService(store, logger);
  return { store, tenant, scheduleService };
}

function silentLogger() {
  return {
    debug() {},
    info() {},
    warn() {},
    error() {}
  };
}
