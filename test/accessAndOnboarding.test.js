import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { AccessRoleService } from "../src/accessRoleService.js";
import { AuthService } from "../src/authService.js";
import { CrmDataStore } from "../src/crmDataStore.js";
import { TenantService } from "../src/tenantService.js";
import { UserOnboardingService } from "../src/userOnboardingService.js";

test("AccessRoleService creates custom cargos with permission modules", () => {
  const { store, tenantService, accessRoleService } = createFixture();
  const tenant = tenantService.createTenant({ name: "Materiais Lobato", slug: "materiais-lobato" });

  const role = accessRoleService.createRole({
    tenantId: tenant.id,
    name: "Consultor de Vendas",
    type: "seller",
    permissions: [
      "dashboard:view",
      "contacts:view",
      "deals:view",
      "deals:write",
      "conversations:view"
    ]
  });

  assert.equal(role.name, "Consultor de Vendas");
  assert.equal(role.type, "seller");
  assert.equal(role.tenantId, tenant.id);
  assert.ok(role.key.includes(tenant.id));
  assert.deepEqual(role.permissions, [
    "dashboard:view",
    "contacts:view",
    "deals:view",
    "deals:write",
    "conversations:view"
  ]);
  assert.equal(accessRoleService.listPermissionCatalog().length > 4, true);
  assert.throws(
    () => accessRoleService.createRole({
      tenantId: tenant.id,
      name: "Cargo Invalido",
      permissions: ["permissao:desconhecida"]
    }),
    /Permissoes desconhecidas/
  );
});

test("UserOnboardingService invites seller, validates email and enables login", () => {
  const { authService, tenantService, accessRoleService, onboardingService } = createFixture();
  const tenant = tenantService.createTenant({ name: "Boa Vista Pisos", slug: "boa-vista-pisos" });
  const role = accessRoleService.createRole({
    tenantId: tenant.id,
    name: "Vendedor Exemplo",
    type: "seller",
    permissions: ["dashboard:view", "deals:view", "deals:write"]
  });

  const invite = onboardingService.createInvite({
    tenantId: tenant.id,
    email: "vendedor.exemplo@cliente.com.br",
    name: "Vendedor Exemplo",
    roleId: role.id,
    accessScope: {
      mode: "seller"
    }
  }, { id: "usr_master", tenantId: tenant.id });

  assert.ok(invite.token);
  assert.ok(invite.url.includes("/accept-invite.html?token="));
  assert.equal(invite.invite.tokenHash, undefined);

  const accepted = onboardingService.acceptInvite({
    token: invite.token,
    name: "Vendedor Exemplo",
    password: "senha123"
  });

  assert.equal(accepted.user.status, "pending_email_verification");
  assert.equal(authService.authenticate("vendedor.exemplo@cliente.com.br", "senha123"), null);
  assert.ok(accepted.verificationUrl.includes("/verify-email.html?token="));

  const verified = onboardingService.verifyEmail(accepted.verificationToken);

  assert.equal(verified.status, "active");
  assert.ok(verified.emailVerifiedAt);
  assert.ok(authService.authenticate("vendedor.exemplo@cliente.com.br", "senha123").token);
});

test("UserOnboardingService links Google identity and trusts verified provider email", () => {
  const { authService, tenantService, accessRoleService, onboardingService } = createFixture();
  const tenant = tenantService.createTenant({ name: "Cliente Google", slug: "cliente-google" });
  const role = accessRoleService.createRole({
    tenantId: tenant.id,
    name: "Supervisor",
    type: "supervisor",
    permissions: ["dashboard:view", "reports:view", "deals:view"]
  });
  const user = authService.createUser({
    tenantId: tenant.id,
    name: "Supervisor Google",
    email: "supervisor@cliente.com.br",
    password: "senha123",
    roleId: role.id,
    status: "pending_email_verification"
  });

  const identity = onboardingService.linkOAuthIdentity(user.id, {
    provider: "google",
    providerUserId: "google-sub-123",
    email: "supervisor@cliente.com.br",
    emailVerified: true
  });
  const updated = authService.getUserWithRole(user.id);

  assert.equal(identity.provider, "google");
  assert.equal(identity.providerUserId, "google-sub-123");
  assert.equal(updated.status, "active");
  assert.ok(updated.emailVerifiedAt);
});

function createFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "access-onboarding-"));
  const store = new CrmDataStore(path.join(dir, "crm.json"));
  store.load();
  const logger = silentLogger();
  const authService = new AuthService(store, {
    auth: {
      bootstrapAdminName: "Administrador",
      bootstrapAdminEmail: "admin@neuraxcrm.local",
      bootstrapAdminPassword: "admin123",
      sessionSecret: "test-secret",
      sessionTtlHours: 12
    }
  }, logger);
  authService.bootstrap();
  const tenantService = new TenantService(store, logger);
  const accessRoleService = new AccessRoleService(store, logger);
  const onboardingService = new UserOnboardingService(store, authService, {
    publicBaseUrl: "https://crm.neurax.com.br"
  }, logger);

  return {
    store,
    authService,
    tenantService,
    accessRoleService,
    onboardingService
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
