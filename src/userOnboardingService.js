import crypto from "node:crypto";

const INVITE_STATUS = new Set(["pending", "accepted", "revoked", "expired"]);

export class UserOnboardingService {
  constructor(store, authService, config = {}, logger = noopLogger()) {
    this.store = store;
    this.authService = authService;
    this.config = config;
    this.logger = logger;
  }

  createInvite(input = {}, actor = {}) {
    const tenant = this.requireTenant(input.tenantId || actor.tenantId);
    const email = normalizeEmail(input.email);
    if (!email) throw new Error("Email do convite e obrigatorio.");
    if (this.store.findOne("users", (user) => user.email === email)) {
      throw new Error("Ja existe usuario com este email.");
    }

    const role = this.requireRole(input.roleId, tenant.id);
    const token = createToken();
    const invite = this.store.insert("userInvites", {
      tenantId: tenant.id,
      email,
      name: text(input.name),
      roleId: role.id,
      accessScope: input.accessScope || null,
      tokenHash: hashToken(token),
      status: "pending",
      expiresAt: hoursFromNow(input.expiresInHours || 72),
      acceptedAt: "",
      revokedAt: "",
      invitedByUserId: actor.id || ""
    });

    this.logger.info("user_invite_created", {
      tenantId: tenant.id,
      inviteId: invite.id,
      email
    });

    return {
      invite: sanitizeSecret(invite),
      token,
      url: buildInviteUrl(this.config, token)
    };
  }

  acceptInvite({ token, name = "", password = "" } = {}) {
    const invite = this.findValidInvite(token);
    const user = this.authService.createUser({
      tenantId: invite.tenantId,
      name: name || invite.name || invite.email,
      email: invite.email,
      password,
      roleId: invite.roleId,
      status: "pending_email_verification",
      emailVerifiedAt: "",
      accessScope: invite.accessScope || null
    });

    const verification = this.createEmailVerification(user.id, invite.tenantId);
    this.store.update("userInvites", invite.id, {
      status: "accepted",
      acceptedAt: new Date().toISOString(),
      acceptedUserId: user.id
    });

    this.logger.info("user_invite_accepted", {
      tenantId: invite.tenantId,
      inviteId: invite.id,
      userId: user.id
    });

    return {
      user: this.authService.getUserWithRole(user.id),
      verificationToken: verification.token,
      verificationUrl: buildVerificationUrl(this.config, verification.token)
    };
  }

  createEmailVerification(userId, tenantId = "") {
    const user = this.store.findById("users", userId);
    if (!user) throw new Error("Usuario nao encontrado.");
    const token = createToken();
    const record = this.store.insert("emailVerifications", {
      tenantId: tenantId || user.tenantId,
      userId: user.id,
      email: user.email,
      tokenHash: hashToken(token),
      expiresAt: hoursFromNow(24),
      verifiedAt: ""
    });

    return {
      record: sanitizeSecret(record),
      token
    };
  }

  verifyEmail(token) {
    const tokenHash = hashToken(token);
    const record = this.store.findOne("emailVerifications", (item) => (
      item.tokenHash === tokenHash && !item.verifiedAt
    ));
    if (!record) throw new Error("Token de validacao invalido.");
    if (isExpired(record.expiresAt)) throw new Error("Token de validacao expirado.");

    const verifiedAt = new Date().toISOString();
    const user = this.store.update("users", record.userId, {
      status: "active",
      emailVerifiedAt: verifiedAt
    });
    this.store.update("emailVerifications", record.id, {
      verifiedAt
    });

    return this.authService.getUserWithRole(user.id);
  }

  linkOAuthIdentity(userId, input = {}) {
    const user = this.store.findById("users", userId);
    if (!user) throw new Error("Usuario nao encontrado.");

    const provider = text(input.provider || "google").toLowerCase();
    const providerUserId = requiredText(input.providerUserId, "Identificador do provedor e obrigatorio.");
    const duplicate = this.store.findOne("oauthIdentities", (identity) => (
      identity.provider === provider && identity.providerUserId === providerUserId
    ));
    if (duplicate && duplicate.userId !== user.id) throw new Error("Conta externa ja vinculada a outro usuario.");

    const existing = this.store.findOne("oauthIdentities", (identity) => (
      identity.provider === provider && identity.userId === user.id
    ));
    const payload = {
      tenantId: user.tenantId,
      userId: user.id,
      provider,
      providerUserId,
      email: normalizeEmail(input.email || user.email),
      emailVerified: Boolean(input.emailVerified),
      linkedAt: new Date().toISOString()
    };

    const identity = existing
      ? this.store.update("oauthIdentities", existing.id, payload)
      : this.store.insert("oauthIdentities", payload);

    if (payload.emailVerified && !user.emailVerifiedAt) {
      this.store.update("users", user.id, {
        emailVerifiedAt: new Date().toISOString(),
        status: user.status === "pending_email_verification" ? "active" : user.status
      });
    }

    return identity;
  }

  findValidInvite(token) {
    const tokenHash = hashToken(token);
    const invite = this.store.findOne("userInvites", (item) => item.tokenHash === tokenHash);
    if (!invite || invite.status !== "pending") throw new Error("Convite invalido.");
    if (isExpired(invite.expiresAt)) {
      this.store.update("userInvites", invite.id, { status: "expired" });
      throw new Error("Convite expirado.");
    }
    return invite;
  }

  requireTenant(tenantId) {
    const tenant = this.store.findById("tenants", tenantId);
    if (!tenant) throw new Error("Cliente SaaS nao encontrado.");
    return tenant;
  }

  requireRole(roleId, tenantId) {
    const role = this.store.findById("roles", roleId);
    if (!role) throw new Error("Cargo nao encontrado.");
    if (role.tenantId && role.tenantId !== tenantId) throw new Error("Cargo pertence a outro cliente SaaS.");
    return role;
  }
}

function buildInviteUrl(config, token) {
  return `${baseUrl(config)}/accept-invite.html?token=${encodeURIComponent(token)}`;
}

function buildVerificationUrl(config, token) {
  return `${baseUrl(config)}/verify-email.html?token=${encodeURIComponent(token)}`;
}

function baseUrl(config = {}) {
  return String(config.publicBaseUrl || config.appUrl || "http://localhost:3000").replace(/\/+$/, "");
}

function createToken() {
  return crypto.randomBytes(32).toString("hex");
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function hoursFromNow(hours) {
  return new Date(Date.now() + Number(hours || 1) * 60 * 60 * 1000).toISOString();
}

function isExpired(expiresAt) {
  return Date.parse(expiresAt) < Date.now();
}

function normalizeEmail(value) {
  return text(value).toLowerCase();
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

function sanitizeSecret(record) {
  const { tokenHash, ...safe } = record;
  return safe;
}

function noopLogger() {
  return {
    info() {},
    warn() {},
    error() {}
  };
}
