import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { AuthService } from "../src/authService.js";
import { CrmDataStore } from "../src/crmDataStore.js";

test("AuthService bootstraps admin role and user", () => {
  const { auth, store } = createAuthService();

  const admin = auth.bootstrap();

  assert.equal(store.list("roles").length, 3);
  assert.equal(store.list("users").length, 1);
  assert.equal(admin.email, "admin@neuraxcrm.local");
  assert.equal(admin.passwordHash, undefined);
});

test("AuthService authenticates and returns sanitized session user", () => {
  const { auth } = createAuthService();
  auth.bootstrap();

  const session = auth.authenticate("admin@neuraxcrm.local", "admin123");

  assert.ok(session.token);
  assert.equal(session.user.email, "admin@neuraxcrm.local");
  assert.equal(session.user.passwordHash, undefined);
  assert.ok(session.user.permissions.includes("users:write"));
});

test("AuthService rejects invalid password", () => {
  const { auth } = createAuthService();
  auth.bootstrap();

  assert.equal(auth.authenticate("admin@neuraxcrm.local", "wrong"), null);
});

test("AuthService creates seller user with role", () => {
  const { auth, store } = createAuthService();
  auth.bootstrap();
  const sellerRole = store.findOne("roles", (role) => role.key === "seller");

  const seller = auth.createUser({
    name: "Vendedor",
    email: "seller@example.com",
    password: "123456",
    roleId: sellerRole.id
  });

  assert.equal(seller.email, "seller@example.com");
  assert.equal(auth.listUsers().length, 2);
});

function createAuthService() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "auth-service-"));
  const store = new CrmDataStore(path.join(dir, "crm.json"));
  store.load();
  const auth = new AuthService(store, {
    auth: {
      bootstrapAdminName: "Administrador",
      bootstrapAdminEmail: "admin@neuraxcrm.local",
      bootstrapAdminPassword: "admin123",
      sessionSecret: "test-secret",
      sessionTtlHours: 12
    }
  }, silentLogger());
  return { auth, store };
}

function silentLogger() {
  return {
    debug() {},
    info() {},
    warn() {},
    error() {}
  };
}
