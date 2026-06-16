import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { URL } from "node:url";
import { assertTenantAccess, resolveTenantContext } from "./tenantContext.js";
import { randomId } from "./util.js";

export function startPlatformServer({ config, logger, store, conversationService, whatsappClient, authService, observabilityService, tenantService, accessRoleService, userOnboardingService, alertService, evolutionInstanceService, ticketService, vaultService, fileStore, classifierAgent, assistantAgent, botAgent }) {
  const publicDir = path.resolve("public");

  const server = http.createServer(async (request, response) => {
    const parsedUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    const startedAt = Date.now();
    let currentUser = null;
    let tenantContext = null;

    response.on("finish", () => {
      try {
        const metric = observabilityService?.recordRequest({
          tenantId: tenantContext?.tenantId || currentUser?.tenantId || "",
          userId: currentUser?.id || "",
          method: request.method,
          path: parsedUrl.pathname,
          statusCode: response.statusCode,
          durationMs: Date.now() - startedAt,
          ip: request.socket.remoteAddress || "",
          userAgent: request.headers["user-agent"] || ""
        });
        if (metric) store.save();
      } catch (error) {
        logger.warn("request_metric_record_failed", {
          path: parsedUrl.pathname,
          error: error.message
        });
      }
    });

    try {
      const user = authService.getSessionUser(readCookie(request, "allassist_session"));
      currentUser = user;
      tenantContext = user
        ? resolveTenantContext({ request, user, store, config, readCookie })
        : null;
      const isPublicRoute = isPublicRequest(request, parsedUrl);
      if (!user && !isPublicRoute) {
        if (parsedUrl.pathname.startsWith("/api/")) return sendJson(response, 401, { error: "unauthorized" });
        redirect(response, `/login.html?next=${encodeURIComponent(parsedUrl.pathname)}`);
        return;
      }

      if (user && !isPublicRoute) {
        const tenantAccess = assertTenantAccess(user, tenantContext);
        if (!tenantAccess.ok) {
          return sendJson(response, tenantAccess.status, { error: tenantAccess.error });
        }
      }

      if (request.method === "POST" && parsedUrl.pathname === "/api/auth/login") {
        const body = await readJson(request);
        const session = authService.authenticate(body.email, body.password);
        if (!session) return sendJson(response, 401, { error: "invalid_credentials" });
        const loginContext = resolveTenantContext({ request, user: session.user, store, config, readCookie });
        const tenantAccess = assertTenantAccess(session.user, loginContext);
        if (!tenantAccess.ok) {
          authService.revokeSession(session.token);
          return sendJson(response, tenantAccess.status, { error: tenantAccess.error });
        }
        observabilityService?.recordAudit({
          tenantId: loginContext.tenantId || session.user.tenantId,
          userId: session.user.id,
          action: "auth.login",
          entityType: "user",
          entityId: session.user.id
        });
        store.save();
        setSessionCookie(response, session.token, config.auth.sessionTtlHours);
        return sendJson(response, 200, { user: session.user });
      }

      if (request.method === "POST" && parsedUrl.pathname === "/api/auth/logout") {
        if (user) {
          observabilityService?.recordAudit({
            tenantId: tenantContext?.tenantId || user.tenantId,
            userId: user.id,
            action: "auth.logout",
            entityType: "user",
            entityId: user.id
          });
        }
        authService.revokeSession(readCookie(request, "allassist_session"));
        clearSessionCookie(response);
        return sendJson(response, 200, { ok: true });
      }

      if (request.method === "POST" && parsedUrl.pathname === "/api/auth/invites/accept") {
        try {
          const result = userOnboardingService.acceptInvite(await readJson(request));
          store.save();
          return sendJson(response, 200, result);
        } catch (error) {
          return sendJson(response, 400, { error: error.message });
        }
      }

      if (request.method === "POST" && parsedUrl.pathname === "/api/auth/email/verify") {
        try {
          const verifiedUser = userOnboardingService.verifyEmail((await readJson(request)).token);
          store.save();
          return sendJson(response, 200, { user: verifiedUser });
        } catch (error) {
          return sendJson(response, 400, { error: error.message });
        }
      }

      if (request.method === "GET" && parsedUrl.pathname === "/api/auth/me") {
        return sendJson(response, 200, {
          user,
          context: publicTenantContext(tenantContext)
        });
      }

      if (request.method === "GET" && parsedUrl.pathname === "/healthz") {
        return sendJson(response, 200, { ok: true });
      }

      if (request.method === "GET" && parsedUrl.pathname === "/readyz") {
        return sendJson(response, 200, {
          ok: true,
          crmProvider: "local",
          metaConfigured: whatsappClient.isConfigured()
        });
      }

      if (request.method === "GET" && parsedUrl.pathname === "/api/dashboard") {
        if (!requirePermission(response, authService, user, "dashboard:view")) return;
        return sendJson(response, 200, buildSupportDashboard(store, tenantContext.tenantId));
      }

      if (request.method === "GET" && parsedUrl.pathname === "/api/reports/hours") {
        if (!requirePermission(response, authService, user, "reports:view")) return;
        const from = parsedUrl.searchParams.get("from");
        const to = parsedUrl.searchParams.get("to");
        return sendJson(response, 200, buildHoursReport(store, tenantContext.tenantId, from, to));
      }

      // ===== Bot de atendimento (config) =====
      if (request.method === "GET" && parsedUrl.pathname === "/api/bot/config") {
        if (!requirePermission(response, authService, user, "settings:manage")) return;
        const tenant = store.findById("tenants", tenantContext.tenantId);
        return sendJson(response, 200, tenant?.botConfig || { enabled: false, greeting: "", handoffMessage: "" });
      }
      if (request.method === "PUT" && parsedUrl.pathname === "/api/bot/config") {
        if (!requirePermission(response, authService, user, "settings:manage")) return;
        const tenant = store.findById("tenants", tenantContext.tenantId);
        if (!tenant) return sendJson(response, 404, { error: "tenant_not_found" });
        const body = await readJson(request);
        const botConfig = {
          enabled: Boolean(body.enabled),
          greeting: String(body.greeting || "").trim(),
          handoffMessage: String(body.handoffMessage || "").trim()
        };
        store.update("tenants", tenant.id, { botConfig });
        store.save();
        return sendJson(response, 200, botConfig);
      }

      // ===== Base de conhecimento =====
      if (request.method === "POST" && parsedUrl.pathname === "/api/kb/assist") {
        if (!requirePermission(response, authService, user, "kb:view")) return;
        const body = await readJson(request);
        const message = String(body.message || "").trim();
        if (!message) return sendJson(response, 400, { error: "message_required" });
        const articles = store.findAll("kbArticles", (a) => a.tenantId === tenantContext.tenantId).map((a) => ({
          id: a.id,
          title: a.title,
          category: a.category,
          tags: a.tags,
          content: a.content,
          attachmentsText: (a.attachments || []).map((x) => `${x.name} ${x.textExtract || ""}`).join(" ").slice(0, 2000)
        }));
        const result = await assistantAgent.suggest({ message, articles });
        return sendJson(response, 200, result);
      }

      if (request.method === "GET" && parsedUrl.pathname === "/api/kb") {
        if (!requirePermission(response, authService, user, "kb:view")) return;
        const q = normalizeSearch(parsedUrl.searchParams.get("q") || "");
        let data = store.findAll("kbArticles", (a) => a.tenantId === tenantContext.tenantId);
        if (q) data = data.filter((a) => normalizeSearch(`${a.title} ${a.content} ${(a.tags || []).join(" ")} ${a.category}`).includes(q));
        data = data.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
        return sendJson(response, 200, { data });
      }

      if (request.method === "POST" && parsedUrl.pathname === "/api/kb") {
        if (!requirePermission(response, authService, user, "kb:manage")) return;
        const body = await readJson(request);
        if (!String(body.title || "").trim()) return sendJson(response, 400, { error: "title_required" });
        const created = store.insert("kbArticles", {
          tenantId: tenantContext.tenantId,
          title: String(body.title).trim(),
          content: String(body.content || ""),
          category: String(body.category || "").trim(),
          tags: Array.isArray(body.tags) ? body.tags.map((t) => String(t).trim()).filter(Boolean) : String(body.tags || "").split(",").map((t) => t.trim()).filter(Boolean),
          createdBy: user.id
        });
        store.save();
        return sendJson(response, 201, created);
      }

      const kbItemMatch = parsedUrl.pathname.match(/^\/api\/kb\/([^/]+)$/);
      if (request.method === "PATCH" && kbItemMatch) {
        if (!requirePermission(response, authService, user, "kb:manage")) return;
        const article = store.findById("kbArticles", kbItemMatch[1]);
        if (!article || article.tenantId !== tenantContext.tenantId) return sendJson(response, 404, { error: "article_not_found" });
        const body = await readJson(request);
        const patch = {};
        if (body.title !== undefined) patch.title = String(body.title).trim();
        if (body.content !== undefined) patch.content = String(body.content);
        if (body.category !== undefined) patch.category = String(body.category).trim();
        if (body.tags !== undefined) patch.tags = Array.isArray(body.tags) ? body.tags.map((t) => String(t).trim()).filter(Boolean) : String(body.tags || "").split(",").map((t) => t.trim()).filter(Boolean);
        const updated = store.update("kbArticles", article.id, patch);
        store.save();
        return sendJson(response, 200, updated);
      }

      if (request.method === "DELETE" && kbItemMatch) {
        if (!requirePermission(response, authService, user, "kb:manage")) return;
        const article = store.findById("kbArticles", kbItemMatch[1]);
        if (!article || article.tenantId !== tenantContext.tenantId) return sendJson(response, 404, { error: "article_not_found" });
        for (const att of article.attachments || []) fileStore.remove(att.id);
        store.remove("kbArticles", article.id);
        store.save();
        return sendJson(response, 200, { ok: true });
      }

      // Upload de anexo (PDF, TXT, docs, vídeo) — base64 no corpo JSON
      const kbUploadMatch = parsedUrl.pathname.match(/^\/api\/kb\/([^/]+)\/files$/);
      if (request.method === "POST" && kbUploadMatch) {
        if (!requirePermission(response, authService, user, "kb:manage")) return;
        const article = store.findById("kbArticles", kbUploadMatch[1]);
        if (!article || article.tenantId !== tenantContext.tenantId) return sendJson(response, 404, { error: "article_not_found" });
        const body = await readJson(request);
        const name = String(body.name || "arquivo").trim();
        const data = String(body.dataBase64 || "").replace(/^data:[^;]+;base64,/, "");
        if (!data) return sendJson(response, 400, { error: "file_required" });
        const buffer = Buffer.from(data, "base64");
        const MAX = 30 * 1024 * 1024;
        if (buffer.length > MAX) return sendJson(response, 413, { error: "file_too_large", max: "30MB" });
        const fileId = `kbf_${randomId()}`;
        fileStore.save(fileId, buffer);
        // Indexa o conteúdo para a IA usar: TXT direto; PDF via Claude (se houver
        // ANTHROPIC_API_KEY). Outros tipos guardam só metadados.
        const mime = String(body.mime || "application/octet-stream");
        let textExtract = "";
        if (mime.startsWith("text/") || name.toLowerCase().endsWith(".txt")) {
          textExtract = buffer.toString("utf8").slice(0, 20000);
        } else if (mime === "application/pdf" && assistantAgent) {
          textExtract = await assistantAgent.extractDocument({ base64: data, mime, name });
        }
        const attachment = { id: fileId, name, mime, size: buffer.length, textExtract, createdAt: new Date().toISOString() };
        const attachments = [...(article.attachments || []), attachment];
        store.update("kbArticles", article.id, { attachments });
        store.save();
        return sendJson(response, 201, { id: fileId, name, mime, size: buffer.length });
      }

      const kbFileMatch = parsedUrl.pathname.match(/^\/api\/kb\/files\/([^/]+)$/);
      if (kbFileMatch) {
        if (!requirePermission(response, authService, user, "kb:view")) return;
        const fileId = kbFileMatch[1];
        const article = store.findOne("kbArticles", (a) => a.tenantId === tenantContext.tenantId && (a.attachments || []).some((x) => x.id === fileId));
        const att = article?.attachments?.find((x) => x.id === fileId);
        if (!att) return sendJson(response, 404, { error: "file_not_found" });
        if (request.method === "DELETE") {
          if (!requirePermission(response, authService, user, "kb:manage")) return;
          fileStore.remove(fileId);
          store.update("kbArticles", article.id, { attachments: article.attachments.filter((x) => x.id !== fileId) });
          store.save();
          return sendJson(response, 200, { ok: true });
        }
        const buffer = fileStore.read(fileId);
        if (!buffer) return sendJson(response, 404, { error: "file_not_found" });
        response.writeHead(200, {
          "Content-Type": att.mime || "application/octet-stream",
          "Content-Disposition": `inline; filename="${encodeURIComponent(att.name)}"`,
          "Content-Length": buffer.length
        });
        return response.end(buffer);
      }

      if (request.method === "GET" && parsedUrl.pathname === "/api/support/overview") {
        if (!requirePermission(response, authService, user, "support:view")) return;
        return sendJson(response, 200, observabilityService.getSupportOverview());
      }

      if (request.method === "GET" && parsedUrl.pathname === "/api/support/tenants") {
        if (!requirePermission(response, authService, user, "support:tenants")) return;
        return sendJson(response, 200, { data: tenantService.listTenants() });
      }

      if (request.method === "GET" && parsedUrl.pathname === "/api/permissions/catalog") {
        if (!requirePermission(response, authService, user, "users:view")) return;
        return sendJson(response, 200, { data: accessRoleService.listPermissionCatalog() });
      }

      if (request.method === "POST" && parsedUrl.pathname === "/api/roles") {
        if (!requirePermission(response, authService, user, "users:write")) return;
        try {
          const body = await readJson(request);
          const role = accessRoleService.createRole({
            ...body,
            tenantId: authService.isMaster(user) && body.tenantId ? body.tenantId : tenantContext.tenantId
          }, user);
          observabilityService?.recordAudit({
            tenantId: role.tenantId,
            userId: user.id,
            action: "role.created",
            entityType: "role",
            entityId: role.id
          });
          store.save();
          return sendJson(response, 201, role);
        } catch (error) {
          return sendJson(response, 400, { error: error.message });
        }
      }

      if (request.method === "POST" && parsedUrl.pathname === "/api/users/invites") {
        if (!requirePermission(response, authService, user, "users:write")) return;
        try {
          const body = await readJson(request);
          const result = userOnboardingService.createInvite({
            ...body,
            tenantId: authService.isMaster(user) && body.tenantId ? body.tenantId : tenantContext.tenantId
          }, user);
          observabilityService?.recordAudit({
            tenantId: result.invite.tenantId,
            userId: user.id,
            action: "user.invite.created",
            entityType: "userInvite",
            entityId: result.invite.id
          });
          store.save();
          return sendJson(response, 201, result);
        } catch (error) {
          return sendJson(response, 400, { error: error.message });
        }
      }

      if (request.method === "POST" && parsedUrl.pathname === "/api/support/tenants") {
        if (!requirePermission(response, authService, user, "support:tenants")) return;
        try {
          const tenant = tenantService.createTenant(await readJson(request), user);
          observabilityService?.recordAudit({
            tenantId: tenant.id,
            userId: user.id,
            action: "tenant.created",
            entityType: "tenant",
            entityId: tenant.id,
            metadata: {
              slug: tenant.slug
            }
          });
          store.save();
          return sendJson(response, 201, tenant);
        } catch (error) {
          return sendJson(response, 400, { error: error.message });
        }
      }

      const tenantMatch = parsedUrl.pathname.match(/^\/api\/support\/tenants\/([^/]+)$/);
      if (request.method === "PUT" && tenantMatch) {
        if (!requirePermission(response, authService, user, "support:tenants")) return;
        try {
          const tenant = tenantService.updateTenant(tenantMatch[1], await readJson(request), user);
          if (!tenant) return sendJson(response, 404, { error: "tenant_not_found" });
          observabilityService?.recordAudit({
            tenantId: tenant.id,
            userId: user.id,
            action: "tenant.updated",
            entityType: "tenant",
            entityId: tenant.id,
            metadata: {
              slug: tenant.slug
            }
          });
          store.save();
          return sendJson(response, 200, tenant);
        } catch (error) {
          return sendJson(response, 400, { error: error.message });
        }
      }

      const tenantCrmDataDeleteMatch = parsedUrl.pathname.match(/^\/api\/support\/tenants\/([^/]+)\/crm-data$/);
      if (request.method === "DELETE" && tenantCrmDataDeleteMatch) {
        if (!requirePermission(response, authService, user, "support:tenants")) return;
        const tenantId = tenantCrmDataDeleteMatch[1];
        if (!store.findById("tenants", tenantId)) return sendJson(response, 404, { error: "tenant_not_found" });
        const before = {
          contacts: store.list("contacts").filter((c) => c.tenantId === tenantId).length,
          deals: store.list("deals").filter((d) => d.tenantId === tenantId).length
        };
        for (const collection of ["contacts", "deals", "dealLogs", "conversations", "messages", "syncRuns"]) {
          store.data[collection] = store.data[collection].filter((r) => r.tenantId !== tenantId);
        }
        observabilityService?.recordAudit({
          tenantId,
          userId: user.id,
          action: "tenant.crm_data.cleared",
          entityType: "tenant",
          entityId: tenantId,
          metadata: before
        });
        store.save();
        return sendJson(response, 200, { ok: true, deleted: before });
      }

      const tenantWaConfigSeedMatch = parsedUrl.pathname.match(/^\/api\/support\/tenants\/([^/]+)\/whatsapp-config\/seed-from-env$/);
      if (request.method === "POST" && tenantWaConfigSeedMatch) {
        if (!requirePermission(response, authService, user, "support:tenants")) return;
        const tenantId = tenantWaConfigSeedMatch[1];
        if (!store.findById("tenants", tenantId)) return sendJson(response, 404, { error: "tenant_not_found" });
        if (!config.meta.phoneNumberId && !config.meta.accessToken) {
          return sendJson(response, 400, { error: "META_PHONE_NUMBER_ID e META_ACCESS_TOKEN não estão configurados no .env" });
        }
        const existing = store.list("whatsappSettings").find((s) => s.tenantId === tenantId);
        const data = {
          tenantId,
          wabaId: config.meta.wabaId || "",
          phoneNumberId: config.meta.phoneNumberId || "",
          accessToken: config.meta.accessToken || "",
          defaultVariables: existing?.defaultVariables || {}
        };
        const saved = existing
          ? store.update("whatsappSettings", existing.id, data)
          : store.insert("whatsappSettings", data);
        store.save();
        return sendJson(response, 200, saved);
      }

      const tenantWaConfigMatch = parsedUrl.pathname.match(/^\/api\/support\/tenants\/([^/]+)\/whatsapp-config$/);
      if (request.method === "GET" && tenantWaConfigMatch) {
        if (!requirePermission(response, authService, user, "support:tenants")) return;
        const tenantId = tenantWaConfigMatch[1];
        if (!store.findById("tenants", tenantId)) return sendJson(response, 404, { error: "tenant_not_found" });
        const existing = store.list("whatsappSettings").find((s) => s.tenantId === tenantId);
        return sendJson(response, 200, existing || { tenantId, wabaId: "", phoneNumberId: "", accessToken: "", defaultVariables: {} });
      }
      if (request.method === "PUT" && tenantWaConfigMatch) {
        if (!requirePermission(response, authService, user, "support:tenants")) return;
        const tenantId = tenantWaConfigMatch[1];
        if (!store.findById("tenants", tenantId)) return sendJson(response, 404, { error: "tenant_not_found" });
        const body = await readJson(request);
        const existing = store.list("whatsappSettings").find((s) => s.tenantId === tenantId);
        const data = {
          tenantId,
          wabaId: String(body.wabaId || ""),
          phoneNumberId: String(body.phoneNumberId || ""),
          accessToken: String(body.accessToken || ""),
          defaultVariables: body.defaultVariables || {}
        };
        const saved = existing
          ? store.update("whatsappSettings", existing.id, data)
          : store.insert("whatsappSettings", data);
        observabilityService?.recordAudit({
          tenantId,
          userId: user.id,
          action: "tenant.whatsapp_config.updated",
          entityType: "integration",
          entityId: tenantId
        });
        store.save();
        return sendJson(response, 200, saved);
      }

      const tenantSyncConfigMatch = parsedUrl.pathname.match(/^\/api\/support\/tenants\/([^/]+)\/sync-config$/);
      if (request.method === "GET" && tenantSyncConfigMatch) {
        if (!requirePermission(response, authService, user, "support:tenants")) return;
        const tenantId = tenantSyncConfigMatch[1];
        const tenant = store.findById("tenants", tenantId);
        if (!tenant) return sendJson(response, 404, { error: "tenant_not_found" });
        return sendJson(response, 200, erpIntegrationService.getPublicSettings(tenantId));
      }
      if (request.method === "PUT" && tenantSyncConfigMatch) {
        if (!requirePermission(response, authService, user, "support:tenants")) return;
        try {
          const tenantId = tenantSyncConfigMatch[1];
          const tenant = store.findById("tenants", tenantId);
          if (!tenant) return sendJson(response, 404, { error: "tenant_not_found" });
          const body = await readJson(request);
          const saved = erpIntegrationService.updateSettings(
            { dtIni: body.dtIni || "", dtFim: body.dtFim || "", idEmpresa: body.idEmpresa, lookbackDays: body.lookbackDays, lookaheadDays: body.lookaheadDays },
            { id: user.id, tenantId }
          );
          observabilityService?.recordAudit({
            tenantId,
            userId: user.id,
            action: "tenant.sync_config_updated",
            entityType: "tenant",
            entityId: tenantId,
            metadata: { dtIni: saved.dtIni, dtFim: saved.dtFim, idEmpresa: saved.idEmpresa }
          });
          store.save();
          return sendJson(response, 200, saved);
        } catch (error) {
          return sendJson(response, 400, { error: error.message });
        }
      }

      const userScopeMatch = parsedUrl.pathname.match(/^\/api\/support\/users\/([^/]+)\/access-scope$/);
      if (request.method === "PUT" && userScopeMatch) {
        if (!requirePermission(response, authService, user, "support:tenants")) return;
        try {
          observabilityService?.recordAudit({
            tenantId: updatedUser.tenantId,
            userId: user.id,
            action: "user.access_scope.updated",
            entityType: "user",
            entityId: updatedUser.id
          });
          store.save();
          return sendJson(response, 200, authService.getUserWithRole(updatedUser.id));
        } catch (error) {
          return sendJson(response, 400, { error: error.message });
        }
      }

      if (request.method === "PUT" && parsedUrl.pathname === "/api/support/active-tenant") {
        if (!requirePermission(response, authService, user, "support:tenants")) return;
        const body = await readJson(request);
        const tenant = store.findById("tenants", body.tenantId);
        if (!tenant) return sendJson(response, 404, { error: "tenant_not_found" });
        setActiveTenantCookie(response, config, tenant.id);
        return sendJson(response, 200, { tenant });
      }

      if (request.method === "DELETE" && parsedUrl.pathname === "/api/support/active-tenant") {
        if (!requirePermission(response, authService, user, "support:tenants")) return;
        clearActiveTenantCookie(response, config);
        return sendJson(response, 200, { ok: true });
      }

      if (request.method === "GET" && parsedUrl.pathname === "/api/support/integration-events") {
        if (!requirePermission(response, authService, user, "support:view")) return;
        return sendJson(response, 200, {
          data: observabilityService.listIntegrationEvents({ limit: numberParam(parsedUrl, "limit", 150) })
        });
      }

      if (request.method === "GET" && parsedUrl.pathname === "/api/support/audit-events") {
        if (!requirePermission(response, authService, user, "support:view")) return;
        return sendJson(response, 200, {
          data: observabilityService.listAuditEvents({ limit: numberParam(parsedUrl, "limit", 150) })
        });
      }

      if (request.method === "GET" && parsedUrl.pathname === "/api/support/request-metrics") {
        if (!requirePermission(response, authService, user, "observability:view")) return;
        return sendJson(response, 200, {
          data: observabilityService.listRequestMetrics({ limit: numberParam(parsedUrl, "limit", 150) })
        });
      }

      if (request.method === "GET" && parsedUrl.pathname === "/api/support/logs") {
        if (!requirePermission(response, authService, user, "support:logs")) return;
        return sendJson(response, 200, {
          data: readLogTail(config.logFile, numberParam(parsedUrl, "limit", 200))
        });
      }

      if (request.method === "POST" && parsedUrl.pathname === "/api/tenant/settings") {
        if (!requirePermission(response, authService, user, "settings:manage")) return;
        const body = await readJson(request);
        const tenantId = tenantContext.tenantId;
        const tenant = store.findById("tenants", tenantId);
        if (!tenant) return sendJson(response, 404, { error: "tenant_not_found" });
        const allowed = ["expiryWarningDays"];
        const patch = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));
        store.update("tenants", tenantId, patch);
        store.save();
        return sendJson(response, 200, { ok: true });
      }

      if (request.method === "GET" && parsedUrl.pathname === "/api/contacts") {
        if (!requirePermission(response, authService, user, "contacts:view")) return;
        const tid = tenantContext.tenantId;
        const customersById = new Map(store.findAll("customers", (c) => c.tenantId === tid).map((c) => [c.id, c]));
        return sendJson(response, 200, {
          data: store
            .list("contacts")
            .filter((contact) => contact.tenantId === tid)
            .map((contact) => ({ ...contact, customerName: contact.customerId ? customersById.get(contact.customerId)?.name || null : null }))
            .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
        });
      }

      if (request.method === "POST" && parsedUrl.pathname === "/api/contacts") {
        if (!requirePermission(response, authService, user, "contacts:write")) return;
        const body = await readJson(request);
        if (!String(body.name || "").trim()) return sendJson(response, 400, { error: "name_required" });
        const created = store.insert("contacts", {
          tenantId: tenantContext.tenantId,
          name: String(body.name).trim(),
          phone: String(body.phone || "").replace(/\D/g, ""),
          email: String(body.email || "").trim(),
          city: String(body.city || "").trim(),
          state: String(body.state || "").trim(),
          document: String(body.document || "").trim(),
          notes: String(body.notes || "").trim(),
          customerId: body.customerId || null,
          source: body.source || "manual"
        });
        store.save();
        return sendJson(response, 201, created);
      }

      // ===== Clientes (empresas) =====
      if (request.method === "GET" && parsedUrl.pathname === "/api/customers") {
        if (!requirePermission(response, authService, user, "contacts:view")) return;
        const tid = tenantContext.tenantId;
        const contacts = store.findAll("contacts", (c) => c.tenantId === tid);
        const tickets = store.findAll("tickets", (t) => t.tenantId === tid);
        const data = store.findAll("customers", (c) => c.tenantId === tid).map((customer) => {
          const custContacts = contacts.filter((c) => c.customerId === customer.id);
          const contactIds = new Set(custContacts.map((c) => c.id));
          const custTickets = tickets.filter((t) => contactIds.has(t.contactId));
          const totalSeconds = custTickets.reduce((sum, t) => sum + timerSeconds(t.timeTracking), 0);
          return {
            ...customer,
            contactsCount: custContacts.length,
            ticketsCount: custTickets.length,
            openTicketsCount: custTickets.filter((t) => t.status !== "closed").length,
            totalSeconds
          };
        }).sort((a, b) => String(a.name).localeCompare(String(b.name)));
        return sendJson(response, 200, { data });
      }

      if (request.method === "POST" && parsedUrl.pathname === "/api/customers") {
        if (!requirePermission(response, authService, user, "contacts:write")) return;
        const body = await readJson(request);
        if (!String(body.name || "").trim()) return sendJson(response, 400, { error: "name_required" });
        const created = store.insert("customers", {
          tenantId: tenantContext.tenantId,
          ...customerFieldsFromBody(body)
        });
        store.save();
        return sendJson(response, 201, created);
      }

      const customerDetailMatch = parsedUrl.pathname.match(/^\/api\/customers\/([^/]+)$/);
      if (request.method === "GET" && customerDetailMatch) {
        if (!requirePermission(response, authService, user, "contacts:view")) return;
        const tid = tenantContext.tenantId;
        const customer = store.findById("customers", customerDetailMatch[1]);
        if (!customer || customer.tenantId !== tid) return sendJson(response, 404, { error: "customer_not_found" });
        const custContacts = store.findAll("contacts", (c) => c.tenantId === tid && c.customerId === customer.id);
        const contactIds = new Set(custContacts.map((c) => c.id));
        const custTickets = store.findAll("tickets", (t) => t.tenantId === tid && contactIds.has(t.contactId));
        const contactName = (id) => custContacts.find((c) => c.id === id)?.name || "Cliente";
        return sendJson(response, 200, {
          ...customer,
          contacts: custContacts,
          totalSeconds: custTickets.reduce((sum, t) => sum + timerSeconds(t.timeTracking), 0),
          history: custTickets
            .filter((t) => t.status === "closed")
            .sort((a, b) => String(b.closedAt).localeCompare(String(a.closedAt)))
            .map((t) => ({ id: t.id, subject: t.subject, contactName: contactName(t.contactId), closedAt: t.closedAt, closureNote: t.closureNote, seconds: timerSeconds(t.timeTracking) }))
        });
      }

      const customerPatchMatch = parsedUrl.pathname.match(/^\/api\/customers\/([^/]+)$/);
      if (request.method === "PATCH" && customerPatchMatch) {
        if (!requirePermission(response, authService, user, "contacts:write")) return;
        const customer = store.findById("customers", customerPatchMatch[1]);
        if (!customer || customer.tenantId !== tenantContext.tenantId) return sendJson(response, 404, { error: "customer_not_found" });
        const body = await readJson(request);
        if (body.name !== undefined && !String(body.name).trim()) return sendJson(response, 400, { error: "name_required" });
        const updated = store.update("customers", customer.id, customerFieldsFromBody(body));
        store.save();
        return sendJson(response, 200, updated);
      }

      // ===== Cofre de acessos (credenciais por cliente) =====
      const credListMatch = parsedUrl.pathname.match(/^\/api\/customers\/([^/]+)\/credentials$/);
      if (request.method === "GET" && credListMatch) {
        if (!requirePermission(response, authService, user, "vault:view")) return;
        const customer = store.findById("customers", credListMatch[1]);
        if (!customer || customer.tenantId !== tenantContext.tenantId) return sendJson(response, 404, { error: "customer_not_found" });
        return sendJson(response, 200, { data: vaultService.listByCustomer(tenantContext.tenantId, credListMatch[1]) });
      }

      if (request.method === "POST" && credListMatch) {
        if (!requirePermission(response, authService, user, "vault:manage")) return;
        const customer = store.findById("customers", credListMatch[1]);
        if (!customer || customer.tenantId !== tenantContext.tenantId) return sendJson(response, 404, { error: "customer_not_found" });
        try {
          const created = vaultService.createCredential(tenantContext.tenantId, credListMatch[1], await readJson(request), user.id);
          observabilityService?.recordAudit({ tenantId: tenantContext.tenantId, userId: user.id, action: "vault.credential.created", entityType: "credential", entityId: created.id });
          store.save();
          return sendJson(response, 201, created);
        } catch (error) {
          return sendJson(response, 400, { error: error.message });
        }
      }

      const credRevealMatch = parsedUrl.pathname.match(/^\/api\/credentials\/([^/]+)\/reveal$/);
      if (request.method === "GET" && credRevealMatch) {
        if (!requirePermission(response, authService, user, "vault:view")) return;
        try {
          const revealed = vaultService.revealCredential(credRevealMatch[1], tenantContext.tenantId);
          observabilityService?.recordAudit({ tenantId: tenantContext.tenantId, userId: user.id, action: "vault.credential.revealed", entityType: "credential", entityId: credRevealMatch[1] });
          store.save();
          return sendJson(response, 200, revealed);
        } catch (error) {
          return sendJson(response, 404, { error: error.message });
        }
      }

      const credItemMatch = parsedUrl.pathname.match(/^\/api\/credentials\/([^/]+)$/);
      if (request.method === "PATCH" && credItemMatch) {
        if (!requirePermission(response, authService, user, "vault:manage")) return;
        try {
          const updated = vaultService.updateCredential(credItemMatch[1], tenantContext.tenantId, await readJson(request), user.id);
          store.save();
          return sendJson(response, 200, updated);
        } catch (error) {
          return sendJson(response, 404, { error: error.message });
        }
      }

      if (request.method === "DELETE" && credItemMatch) {
        if (!requirePermission(response, authService, user, "vault:manage")) return;
        try {
          vaultService.deleteCredential(credItemMatch[1], tenantContext.tenantId);
          store.save();
          return sendJson(response, 200, { ok: true });
        } catch (error) {
          return sendJson(response, 404, { error: error.message });
        }
      }

      const contactPatchMatch = parsedUrl.pathname.match(/^\/api\/contacts\/([^/]+)$/);
      if (request.method === "PATCH" && contactPatchMatch) {
        if (!requirePermission(response, authService, user, "contacts:write")) return;
        const contactId = contactPatchMatch[1];
        const contact = store.findById("contacts", contactId);
        if (!contact || contact.tenantId !== tenantContext.tenantId) {
          return sendJson(response, 404, { error: "contact_not_found" });
        }
        const body = await readJson(request);
        const patch = {};
        if (body.phone !== undefined) patch.phone = String(body.phone || "").trim();
        if (body.name !== undefined) patch.name = String(body.name || "").trim();
        if (body.email !== undefined) patch.email = String(body.email || "").trim();
        if (body.city !== undefined) patch.city = String(body.city || "").trim();
        if (body.state !== undefined) patch.state = String(body.state || "").trim();
        if (body.document !== undefined) patch.document = String(body.document || "").trim();
        if (body.notes !== undefined) patch.notes = String(body.notes || "").trim();
        if (body.customerId !== undefined) patch.customerId = body.customerId || null;
        const updated = store.update("contacts", contactId, patch);
        observabilityService?.recordAudit({
          tenantId: tenantContext.tenantId,
          userId: user.id,
          action: "contact.updated",
          entityType: "contact",
          entityId: contactId,
          metadata: patch
        });
        store.save();
        return sendJson(response, 200, updated);
      }


      if (request.method === "GET" && parsedUrl.pathname === "/api/conversations") {
        if (!requirePermission(response, authService, user, "conversations:view")) return;
        let convs = conversationService.listConversations(Object.fromEntries(parsedUrl.searchParams.entries()), tenantContext.tenantId);
        // Se a instância Evolution tiver assignedUserIds, filtra conversas do canal evolution
        const canSeeAll = authService.hasPermission(user, "conversations:all") || authService.hasPermission(user, "settings:manage");
        if (!canSeeAll && evolutionInstanceService) {
          const myInstance = evolutionInstanceService.getByUser(tenantContext.tenantId, user.id);
          const allInstances = evolutionInstanceService.listByTenant(tenantContext.tenantId);
          const perUserInstances = allInstances.filter((i) => i.userId);
          if (perUserInstances.length > 0) {
            // Modo por usuário: só vê as conversas da própria instância
            const myInstanceId = myInstance?.id;
            convs = convs.filter((c) => (c.provider || "meta") !== "evolution" || c.instanceId === myInstanceId);
          } else {
            // Modo legado: usa assignedUserIds se configurado
            const legacyInstance = evolutionInstanceService.getByTenant(tenantContext.tenantId);
            const assigned = legacyInstance?.assignedUserIds || [];
            if (assigned.length > 0) {
              convs = convs.filter((c) => (c.provider || "meta") !== "evolution" || assigned.includes(user.id));
            }
          }
        }
        return sendJson(response, 200, { data: convs });
      }

      const conversationMatch = parsedUrl.pathname.match(/^\/api\/conversations\/([^/]+)$/);
      if (request.method === "GET" && conversationMatch) {
        if (!requirePermission(response, authService, user, "conversations:view")) return;
        const conversation = conversationService.getConversation(conversationMatch[1], tenantContext.tenantId);
        return conversation ? sendJson(response, 200, conversation) : sendJson(response, 404, { error: "conversation_not_found" });
      }

      const conversationPatchMatch = parsedUrl.pathname.match(/^\/api\/conversations\/([^/]+)$/);
      if (request.method === "PATCH" && conversationPatchMatch) {
        if (!requirePermission(response, authService, user, "conversations:write")) return;
        const conv = store.findById("conversations", conversationPatchMatch[1]);
        if (!conv || conv.tenantId !== tenantContext.tenantId) return sendJson(response, 404, { error: "not_found" });
        const body = await readJson(request);
        const allowed = ["status", "assignedTo", "tags"];
        const patch = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));
        const updated = store.update("conversations", conv.id, patch);
        store.save();
        return sendJson(response, 200, updated);
      }

      const conversationReadMatch = parsedUrl.pathname.match(/^\/api\/conversations\/([^/]+)\/read$/);
      if (request.method === "POST" && conversationReadMatch) {
        if (!requirePermission(response, authService, user, "conversations:view")) return;
        const conv = store.findById("conversations", conversationReadMatch[1]);
        if (!conv || (conv.tenantId !== tenantContext.tenantId)) return sendJson(response, 404, { error: "not_found" });
        store.update("conversations", conv.id, { unreadCount: 0 });
        store.save();
        return sendJson(response, 200, { ok: true });
      }

      const conversationSendMatch = parsedUrl.pathname.match(/^\/api\/conversations\/([^/]+)\/messages$/);
      if (request.method === "POST" && conversationSendMatch) {
        if (!requirePermission(response, authService, user, "conversations:write")) return;
        const body = await readJson(request);
        const message = await conversationService.sendText(conversationSendMatch[1], body.body || "", body.actor || "user", tenantContext.tenantId, user.id);
        observabilityService?.recordAudit({
          tenantId: tenantContext.tenantId,
          userId: user.id,
          action: "conversation.message.sent",
          entityType: "conversation",
          entityId: conversationSendMatch[1]
        });
        store.save();
        return sendJson(response, 201, message);
      }


      if (request.method === "GET" && parsedUrl.pathname === "/api/users") {
        if (!requirePermission(response, authService, user, "users:view")) return;
        const requestedTenantId = parsedUrl.searchParams.get("tenantId") || "";
        const targetTenantId = authService.isMaster(user) && requestedTenantId
          ? requestedTenantId
          : tenantContext.tenantId;
        return sendJson(response, 200, {
          data: authService.listUsers({
            tenantId: targetTenantId,
            includeAll: authService.isMaster(user) && !requestedTenantId && parsedUrl.searchParams.get("all") === "true"
          })
        });
      }

      if (request.method === "POST" && parsedUrl.pathname === "/api/users") {
        if (!requirePermission(response, authService, user, "users:write")) return;
        const body = await readJson(request);
        const targetTenantId = authService.isMaster(user) && body.tenantId ? body.tenantId : tenantContext.tenantId;
        if (!authService.isMaster(user) && exceedsUserLimit(store, targetTenantId)) {
          return sendJson(response, 403, { error: "user_limit_reached" });
        }
        const created = authService.createUser({
          ...body,
          tenantId: targetTenantId
        });
        const safeCreated = authService.getUserWithRole(created.id);
        observabilityService?.recordAudit({
          tenantId: tenantContext.tenantId,
          userId: user.id,
          action: "user.created",
          entityType: "user",
          entityId: created.id,
          metadata: {
            email: created.email
          }
        });
        store.save();
        return sendJson(response, 201, safeCreated);
      }

      if (request.method === "GET" && parsedUrl.pathname === "/api/roles") {
        if (!requirePermission(response, authService, user, "users:view")) return;
        const requestedTenantId = parsedUrl.searchParams.get("tenantId") || "";
        const targetTenantId = authService.isMaster(user) && requestedTenantId
          ? requestedTenantId
          : tenantContext.tenantId;
        return sendJson(response, 200, {
          data: accessRoleService.listRoles({
            tenantId: targetTenantId,
            includeSystem: true
          })
        });
      }

      if (request.method === "GET" && parsedUrl.pathname === "/webhooks/meta/whatsapp") {
        const mode = parsedUrl.searchParams.get("hub.mode");
        const token = parsedUrl.searchParams.get("hub.verify_token");
        const challenge = parsedUrl.searchParams.get("hub.challenge");
        if (mode === "subscribe" && token === config.meta.webhookVerifyToken) {
          response.writeHead(200, { "Content-Type": "text/plain" });
          response.end(challenge || "");
          return;
        }
        return sendJson(response, 403, { error: "invalid_verify_token" });
      }

      if (request.method === "POST" && parsedUrl.pathname === "/webhooks/meta/whatsapp") {
        const rawBody = await readRawBody(request);
        const signature = request.headers["x-hub-signature-256"];
        if (!whatsappClient.verifySignature(rawBody, signature)) {
          return sendJson(response, 403, { error: "invalid_signature" });
        }

        const payload = rawBody.length ? JSON.parse(rawBody.toString("utf8")) : {};
        const saved = conversationService.receiveMetaWebhook(payload);
        store.save();

        // Criar tickets para mensagens inbound novas
        for (const item of saved) {
          if (item.message.direction === "inbound" && ticketService) {
            await _createTicketForConversation(
              item.conversation,
              item.message,
              item.contact,
              ticketService,
              classifierAgent,
              store,
              logger,
              botAgent,
              conversationService
            );
          }
        }

        if (config.meta.markInboundRead) {
          for (const item of saved) {
            await whatsappClient.markAsRead(item.message.providerMessageId);
          }
        }

        for (const item of saved) {
          if (item.message.type === "interactive" || item.message.type === "button") {
            alertService?.notify({
              title: `📲 Cliente quer falar com atendente`,
              message: `${item.contact.name || item.message.from} clicou em "${item.message.body}"\nTelefone: ${item.contact.phone || item.message.from}`
            }).catch(() => {});
          } else if (item.message.direction === "inbound") {
            alertService?.notify({
              title: `💬 Nova mensagem WhatsApp`,
              message: `${item.contact.name || item.message.from}: ${item.message.body}`
            }).catch(() => {});
          }
        }

        logger.info("meta_whatsapp_webhook_processed", { messages: saved.length });
        return sendJson(response, 200, { ok: true, messages: saved.length });
      }

      if (request.method === "POST" && parsedUrl.pathname === "/webhooks/evolution") {
        const payload = await readJson(request);
        const instanceName = payload?.instance;
        if (!instanceName) return sendJson(response, 200, { ok: true });

        // Achar tenant pela instância configurada
        const instance = store.findOne("evolutionInstances", (i) => i.instanceName === instanceName);
        if (!instance) {
          logger.warn("evolution_webhook_unknown_instance", { instanceName });
          return sendJson(response, 200, { ok: true });
        }

        // Status da conexão
        if (payload.event === "connection.update") {
          const state = payload.data?.state;
          const status = state === "open" ? "connected" : state === "connecting" ? "connecting" : "disconnected";
          evolutionInstanceService.updateStatus(instance.id, status);
          logger.info("evolution_connection_update", { instanceName, status });
          return sendJson(response, 200, { ok: true });
        }

        // QR code atualizado
        if (payload.event === "qrcode.updated") {
          const qrCode = payload.data?.qrcode?.base64 || payload.data?.base64 || null;
          evolutionInstanceService.updateStatus(instance.id, "qr_pending", { lastQrCode: qrCode });
          logger.info("evolution_qrcode_updated", { instanceName });
          return sendJson(response, 200, { ok: true });
        }

        // Mensagem recebida
        if (payload.event === "messages.upsert") {
          payload._instanceId = instance.id;
          const result = conversationService.receiveEvolutionWebhook(payload, instance.tenantId);
          if (result) {
            // Criar ticket para mensagem inbound
            if (result.message.direction === "inbound" && ticketService) {
              await _createTicketForConversation(
                result.conversation,
                result.message,
                result.contact,
                ticketService,
                classifierAgent,
                store,
                logger,
                botAgent,
                conversationService
              );
            }
            store.save();
            alertService?.notify({
              title: "💬 Nova mensagem WhatsApp Chat",
              message: `${result.contact.name || result.contact.phone}: ${result.message.body}`
            }).catch(() => {});
            logger.info("evolution_message_received", { tenantId: instance.tenantId, instanceName });
          }
        }

        return sendJson(response, 200, { ok: true });
      }

      if (request.method === "GET" && parsedUrl.pathname === "/api/whatsapp/templates") {
        if (!requirePermission(response, authService, user, "conversations:view")) return;
        const tenantWaSettings = store.list("whatsappSettings").find((s) => s.tenantId === tenantContext.tenantId);
        const effectiveWabaId = tenantWaSettings?.wabaId || config.meta.wabaId;
        const effectiveAccessToken = tenantWaSettings?.accessToken || config.meta.accessToken;
        if (!effectiveWabaId) return sendJson(response, 400, { error: "META_WABA_ID nao configurado — configure em WhatsApp no master ou adicione META_WABA_ID ao .env" });
        if (!effectiveAccessToken) return sendJson(response, 400, { error: "META_ACCESS_TOKEN nao configurado" });
        try {
          const result = await whatsappClient.listTemplates({ wabaId: effectiveWabaId, accessToken: effectiveAccessToken });
          const approved = (result.data || []).filter((t) => t.status === "APPROVED");
          return sendJson(response, 200, { data: approved });
        } catch (error) {
          return sendJson(response, 400, { error: error.message });
        }
      }

      if (request.method === "POST" && parsedUrl.pathname === "/api/whatsapp/send-template") {
        if (!requirePermission(response, authService, user, "conversations:write")) return;
        const body = await readJson(request);
        const to = String(body.to || "").trim();
        const templateName = String(body.templateName || "").trim();
        const language = String(body.language || "pt_BR").trim();
        const components = Array.isArray(body.components) ? body.components : [];
        if (!to) return sendJson(response, 400, { error: "Informe o numero de destino (campo 'to')" });
        if (!templateName) return sendJson(response, 400, { error: "Informe o nome do template (campo 'templateName')" });
        if (!whatsappClient.isConfigured()) return sendJson(response, 400, { error: "WhatsApp nao configurado — verifique META_PHONE_NUMBER_ID e META_ACCESS_TOKEN" });
        logger.info("whatsapp_send_template_attempt", { to, templateName, language, components: JSON.stringify(components) });
        try {
          const result = await whatsappClient.sendTemplate({ to, templateName, language, components });
          observabilityService?.recordAudit({
            tenantId: tenantContext.tenantId,
            userId: user.id,
            action: "whatsapp.template.sent",
            entityType: "conversation",
            entityId: to,
            metadata: { templateName, language }
          });
          store.save();
          return sendJson(response, 200, { ok: true, result });
        } catch (error) {
          const metaDetail = error.body?.error?.message || error.body?.error?.error_user_msg || "";
          const metaCode = error.body?.error?.code;
          const fullMsg = metaDetail
            ? `${error.message} — Meta: ${metaDetail}${metaCode ? ` (code ${metaCode})` : ""}`
            : error.message;
          logger.warn("whatsapp_send_template_failed", { templateName, to, error: fullMsg, body: error.body });
          return sendJson(response, 400, { error: fullMsg, meta: error.body });
        }
      }

      if (request.method === "GET" && parsedUrl.pathname === "/api/whatsapp/settings") {
        if (!requirePermission(response, authService, user, "settings:manage")) return;
        const existing = store.list("whatsappSettings").find((s) => s.tenantId === tenantContext.tenantId);
        return sendJson(response, 200, existing || { tenantId: tenantContext.tenantId, wabaId: "", defaultVariables: {} });
      }

      if (request.method === "PUT" && parsedUrl.pathname === "/api/whatsapp/settings") {
        if (!requirePermission(response, authService, user, "settings:manage")) return;
        const body = await readJson(request);
        const tenantId = tenantContext.tenantId;
        const existing = store.list("whatsappSettings").find((s) => s.tenantId === tenantId);
        const data = {
          tenantId,
          wabaId: String(body.wabaId || ""),
          defaultVariables: body.defaultVariables || {}
        };
        const saved = existing
          ? store.update("whatsappSettings", existing.id, data)
          : store.insert("whatsappSettings", data);
        observabilityService?.recordAudit({
          tenantId,
          userId: user.id,
          action: "whatsapp.settings.updated",
          entityType: "integration",
          entityId: "whatsapp"
        });
        store.save();
        return sendJson(response, 200, saved);
      }

      if (request.method === "POST" && parsedUrl.pathname === "/api/whatsapp/test") {
        const body = await readJson(request);
        const to = String(body.to || "").trim();
        const text = String(body.text || "Mensagem de teste do ALL Assist 🚀").trim();
        if (!to) return sendJson(response, 400, { error: "Informe o número de destino (campo 'to')" });
        if (!whatsappClient.isConfigured()) return sendJson(response, 400, { error: "WhatsApp não configurado — verifique META_PHONE_NUMBER_ID e META_ACCESS_TOKEN no .env" });
        const result = await whatsappClient.sendText({ to, body: text });
        return sendJson(response, 200, { ok: true, result });
      }

      // ─── Evolution API — Configuração por servidor (admin) ──────────

      if (request.method === "GET" && parsedUrl.pathname === "/api/evolution/server-config") {
        if (!requirePermission(response, authService, user, "settings:manage")) return;
        const cfg = evolutionInstanceService.getTenantConfig(tenantContext.tenantId);
        return sendJson(response, 200, { data: cfg ? { apiUrl: cfg.apiUrl } : null });
      }

      if (request.method === "POST" && parsedUrl.pathname === "/api/evolution/server-config") {
        if (!requirePermission(response, authService, user, "settings:manage")) return;
        const body = await readJson(request);
        if (!body.apiUrl || !body.apiKey) {
          return sendJson(response, 400, { error: "apiUrl e apiKey são obrigatórios" });
        }
        const saved = evolutionInstanceService.saveTenantConfig(tenantContext.tenantId, {
          apiUrl: body.apiUrl.trim(),
          apiKey: body.apiKey.trim()
        });
        return sendJson(response, 200, { ok: true, apiUrl: saved.apiUrl });
      }

      // ─── Evolution API — Instância por usuário ────────────────────

      if (request.method === "GET" && parsedUrl.pathname === "/api/evolution/my-instance") {
        if (!requirePermission(response, authService, user, "conversations:view")) return;
        const instance = evolutionInstanceService.getByUser(tenantContext.tenantId, user.id);
        if (!instance) return sendJson(response, 200, { data: null });
        const warmup = evolutionInstanceService.warmupStatus(instance);
        return sendJson(response, 200, { data: { ...instance, warmup } });
      }

      if (request.method === "POST" && parsedUrl.pathname === "/api/evolution/my-instance/connect") {
        if (!requirePermission(response, authService, user, "conversations:view")) return;
        const cfg = evolutionInstanceService.getTenantConfig(tenantContext.tenantId);
        if (!cfg) return sendJson(response, 400, { error: "O administrador ainda não configurou o servidor Evolution. Solicite a configuração." });
        const userName = (user.name || user.email || user.id).replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 12);
        const instanceName = `${userName}-${user.id.slice(-6)}`;
        let instance = evolutionInstanceService.getByUser(tenantContext.tenantId, user.id);
        if (!instance) {
          instance = evolutionInstanceService.saveForUser(tenantContext.tenantId, user.id, {
            instanceName,
            apiUrl: cfg.apiUrl,
            apiKey: cfg.apiKey
          });
        }
        const { EvolutionApiClient } = await import("./evolutionApiClient.js");
        const evoClient = new EvolutionApiClient(instance.apiUrl, instance.apiKey);
        const webhookUrl = `${config.appUrl || `http://localhost:${config.port}`}/webhooks/evolution`;
        try {
          await evoClient.createInstance(instance.instanceName, webhookUrl).catch(() => null);
          const result = await evoClient.connectInstance(instance.instanceName);
          const qrCode = result?.base64 || result?.qrcode?.base64 || null;
          evolutionInstanceService.updateStatus(instance.id, qrCode ? "qr_pending" : "connecting", { lastQrCode: qrCode });
          return sendJson(response, 200, { status: qrCode ? "qr_pending" : "connecting", qrCode, instanceName: instance.instanceName });
        } catch (error) {
          return sendJson(response, 400, { error: error.message });
        }
      }

      if (request.method === "GET" && parsedUrl.pathname === "/api/evolution/my-instance/status") {
        if (!requirePermission(response, authService, user, "conversations:view")) return;
        const instance = evolutionInstanceService.getByUser(tenantContext.tenantId, user.id);
        if (!instance) return sendJson(response, 200, { status: "not_configured" });
        try {
          const { EvolutionApiClient } = await import("./evolutionApiClient.js");
          const evoClient = new EvolutionApiClient(instance.apiUrl, instance.apiKey);
          const result = await evoClient.getConnectionState(instance.instanceName);
          const state = result?.instance?.state || result?.state || "close";
          const status = state === "open" ? "connected" : state === "connecting" ? "connecting" : "disconnected";
          if (status !== instance.status) evolutionInstanceService.updateStatus(instance.id, status);
          return sendJson(response, 200, { status, instanceName: instance.instanceName });
        } catch (error) {
          return sendJson(response, 200, { status: "disconnected", error: error.message });
        }
      }

      if (request.method === "POST" && parsedUrl.pathname === "/api/evolution/my-instance/disconnect") {
        if (!requirePermission(response, authService, user, "conversations:view")) return;
        const instance = evolutionInstanceService.getByUser(tenantContext.tenantId, user.id);
        if (!instance) return sendJson(response, 404, { error: "not_found" });
        try {
          const { EvolutionApiClient } = await import("./evolutionApiClient.js");
          const evoClient = new EvolutionApiClient(instance.apiUrl, instance.apiKey);
          await evoClient.logout(instance.instanceName).catch(() => null);
          evolutionInstanceService.updateStatus(instance.id, "disconnected");
          return sendJson(response, 200, { ok: true });
        } catch (error) {
          return sendJson(response, 400, { error: error.message });
        }
      }

      if (request.method === "POST" && parsedUrl.pathname === "/api/evolution/my-instance/anti-ban") {
        if (!requirePermission(response, authService, user, "conversations:view")) return;
        const instance = evolutionInstanceService.getByUser(tenantContext.tenantId, user.id);
        if (!instance) return sendJson(response, 404, { error: "not_found" });
        const body = await readJson(request);
        const allowed = ["maxPerHour", "maxPerDay", "minDelayMs", "maxDelayMs", "hoursStart", "hoursEnd", "warmupEnabled", "blockOptedOut"];
        const antiBan = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));
        evolutionInstanceService.saveForUser(tenantContext.tenantId, user.id, { antiBan: { ...(instance.antiBan || {}), ...antiBan } });
        return sendJson(response, 200, { ok: true });
      }

      if (request.method === "GET" && parsedUrl.pathname === "/api/evolution/instances") {
        if (!requirePermission(response, authService, user, "settings:manage")) return;
        const instances = evolutionInstanceService.listByTenant(tenantContext.tenantId).map((inst) => {
          const warmup = evolutionInstanceService.warmupStatus(inst);
          const u = inst.userId ? store.findById("users", inst.userId) : null;
          return { ...inst, apiKey: undefined, warmup, userName: u?.name || u?.email || inst.userId };
        });
        return sendJson(response, 200, { data: instances });
      }

      // ─── Evolution API (WhatsApp Chat) — instância legada ────────

      if (request.method === "GET" && parsedUrl.pathname === "/api/evolution/instance") {
        if (!requirePermission(response, authService, user, "settings:manage")) return;
        const instance = evolutionInstanceService.getByTenant(tenantContext.tenantId);
        if (!instance) return sendJson(response, 200, { data: null });
        const warmup = evolutionInstanceService.warmupStatus(instance);
        const stats = instance.stats || {};
        return sendJson(response, 200, { data: { ...instance, warmup, stats } });
      }

      if (request.method === "POST" && parsedUrl.pathname === "/api/evolution/instance") {
        if (!requirePermission(response, authService, user, "settings:manage")) return;
        const body = await readJson(request);
        const allowed = ["instanceName", "apiUrl", "apiKey", "antiBan", "assignedUserIds"];
        const patch = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));
        if (patch.assignedUserIds !== undefined && !Array.isArray(patch.assignedUserIds)) {
          return sendJson(response, 400, { error: "assignedUserIds deve ser um array" });
        }
        const existing = evolutionInstanceService.getByTenant(tenantContext.tenantId);
        // apiKey pode ser omitida na atualização parcial (ex: salvar só assignedUserIds)
        if (!existing && (!patch.instanceName || !patch.apiUrl || !patch.apiKey)) {
          return sendJson(response, 400, { error: "instanceName, apiUrl e apiKey são obrigatórios" });
        }
        if (existing && !patch.apiKey) patch.apiKey = existing.apiKey;
        const saved = evolutionInstanceService.save(tenantContext.tenantId, patch);
        return sendJson(response, 200, saved);
      }

      if (request.method === "POST" && parsedUrl.pathname === "/api/evolution/instance/connect") {
        if (!requirePermission(response, authService, user, "settings:manage")) return;
        const instance = evolutionInstanceService.getByTenant(tenantContext.tenantId);
        if (!instance) return sendJson(response, 400, { error: "Configure a instância antes de conectar" });
        const { EvolutionApiClient } = await import("./evolutionApiClient.js");
        const evoClient = new EvolutionApiClient(instance.apiUrl, instance.apiKey);
        const webhookUrl = `${config.appUrl || `http://localhost:${config.port}`}/webhooks/evolution`;
        try {
          await evoClient.createInstance(instance.instanceName, webhookUrl).catch(() => null);
          const result = await evoClient.connectInstance(instance.instanceName);
          const qrCode = result?.base64 || result?.qrcode?.base64 || null;
          evolutionInstanceService.updateStatus(instance.id, qrCode ? "qr_pending" : "connecting", { lastQrCode: qrCode });
          return sendJson(response, 200, { status: qrCode ? "qr_pending" : "connecting", qrCode });
        } catch (error) {
          return sendJson(response, 400, { error: error.message });
        }
      }

      if (request.method === "GET" && parsedUrl.pathname === "/api/evolution/instance/status") {
        if (!requirePermission(response, authService, user, "settings:manage")) return;
        const instance = evolutionInstanceService.getByTenant(tenantContext.tenantId);
        if (!instance) return sendJson(response, 200, { status: "not_configured" });
        try {
          const { EvolutionApiClient } = await import("./evolutionApiClient.js");
          const evoClient = new EvolutionApiClient(instance.apiUrl, instance.apiKey);
          const result = await evoClient.getConnectionState(instance.instanceName);
          const state = result?.instance?.state || result?.state || "close";
          const status = state === "open" ? "connected" : state === "connecting" ? "connecting" : "disconnected";
          if (status !== instance.status) {
            evolutionInstanceService.updateStatus(instance.id, status);
          }
          return sendJson(response, 200, { status, raw: state });
        } catch (error) {
          return sendJson(response, 200, { status: "disconnected", error: error.message });
        }
      }

      if (request.method === "POST" && parsedUrl.pathname === "/api/evolution/instance/disconnect") {
        if (!requirePermission(response, authService, user, "settings:manage")) return;
        const instance = evolutionInstanceService.getByTenant(tenantContext.tenantId);
        if (!instance) return sendJson(response, 404, { error: "not_found" });
        try {
          const { EvolutionApiClient } = await import("./evolutionApiClient.js");
          const evoClient = new EvolutionApiClient(instance.apiUrl, instance.apiKey);
          await evoClient.logout(instance.instanceName).catch(() => null);
          evolutionInstanceService.updateStatus(instance.id, "disconnected");
          return sendJson(response, 200, { ok: true });
        } catch (error) {
          return sendJson(response, 400, { error: error.message });
        }
      }

      if (request.method === "GET" && parsedUrl.pathname === "/api/evolution/tips") {
        if (!requirePermission(response, authService, user, "settings:manage")) return;
        const { ANTI_BAN_TIPS } = await import("./evolutionInstanceService.js");
        return sendJson(response, 200, { data: ANTI_BAN_TIPS });
      }

      // ===== Tickets =====
      const enrichTicket = (ticket) => {
        if (!ticket) return ticket;
        const contact = ticket.contactId ? store.findById("contacts", ticket.contactId) : null;
        const analyst = ticket.assignedAnalystId ? store.findById("users", ticket.assignedAnalystId) : null;
        const customer = contact?.customerId ? store.findById("customers", contact.customerId) : null;
        return {
          ...ticket,
          contactName: contact?.name || "Cliente",
          contactPhone: contact?.phone || "",
          analystName: analyst?.name || null,
          customerId: customer?.id || null,
          customerName: customer ? (customer.fantasia || customer.name) : null,
          customerHourlyBilling: customer?.hourlyBilling || false,
          customerCredentialsCount: customer ? store.findAll("credentials", (c) => c.customerId === customer.id).length : 0
        };
      };

      if (request.method === "GET" && parsedUrl.pathname === "/api/tickets") {
        if (!requirePermission(response, authService, user, "tickets:view")) return;
        const filters = Object.fromEntries(parsedUrl.searchParams.entries());
        const open = ticketService.listOpenTickets(tenantContext.tenantId, filters);
        // Inclui também tickets fechados hoje (coluna "Fechados hoje")
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const closedToday = store.findAll("tickets",
          t => t.tenantId === tenantContext.tenantId
            && t.status === "closed"
            && t.closedAt
            && new Date(t.closedAt) >= todayStart
        );
        const all = [...open, ...closedToday].map(enrichTicket);
        return sendJson(response, 200, { data: all });
      }

      if (request.method === "GET" && parsedUrl.pathname === "/api/tickets/analysts") {
        if (!requirePermission(response, authService, user, "tickets:view")) return;
        const analysts = authService
          .listUsers({ tenantId: tenantContext.tenantId })
          .filter((u) => u.permissions?.includes("tickets:respond"))
          .map((u) => ({ id: u.id, name: u.name, email: u.email }));
        return sendJson(response, 200, { data: analysts });
      }

      const ticketDetailMatch = parsedUrl.pathname.match(/^\/api\/tickets\/([^/]+)$/);
      if (request.method === "GET" && ticketDetailMatch) {
        if (!requirePermission(response, authService, user, "tickets:view")) return;
        const ticket = ticketService.getTicket(ticketDetailMatch[1], tenantContext.tenantId);
        if (!ticket) return sendJson(response, 404, { error: "ticket_not_found" });
        const conversation = ticket.conversationId
          ? conversationService.getConversation(ticket.conversationId, tenantContext.tenantId)
          : null;
        return sendJson(response, 200, {
          ...enrichTicket(ticket),
          conversation
        });
      }

      const ticketAssignMatch = parsedUrl.pathname.match(/^\/api\/tickets\/([^/]+)\/assign$/);
      if (request.method === "POST" && ticketAssignMatch) {
        if (!requirePermission(response, authService, user, "tickets:respond")) return;
        const body = await readJson(request);
        try {
          const updated = ticketService.assignTicket(ticketAssignMatch[1], body.analystId || null, tenantContext.tenantId, user.id);
          store.save();
          return sendJson(response, 200, enrichTicket(updated));
        } catch (error) {
          return sendJson(response, 404, { error: "ticket_not_found" });
        }
      }

      const ticketTransferMatch = parsedUrl.pathname.match(/^\/api\/tickets\/([^/]+)\/transfer$/);
      if (request.method === "POST" && ticketTransferMatch) {
        if (!requirePermission(response, authService, user, "tickets:transfer")) return;
        const body = await readJson(request);
        try {
          const updated = ticketService.transferTicket(ticketTransferMatch[1], body.analystId || null, tenantContext.tenantId, user.id);
          store.save();
          return sendJson(response, 200, enrichTicket(updated));
        } catch (error) {
          return sendJson(response, 404, { error: "ticket_not_found" });
        }
      }

      const ticketCloseMatch = parsedUrl.pathname.match(/^\/api\/tickets\/([^/]+)\/close$/);
      if (request.method === "POST" && ticketCloseMatch) {
        if (!requirePermission(response, authService, user, "tickets:close")) return;
        const body = await readJson(request);
        try {
          const updated = ticketService.closeTicket(ticketCloseMatch[1], tenantContext.tenantId, body.closureNote || "", user.id);
          store.save();
          return sendJson(response, 200, enrichTicket(updated));
        } catch (error) {
          return sendJson(response, 404, { error: "ticket_not_found" });
        }
      }

      const ticketStatusMatch = parsedUrl.pathname.match(/^\/api\/tickets\/([^/]+)\/status$/);
      if (request.method === "POST" && ticketStatusMatch) {
        if (!requirePermission(response, authService, user, "tickets:respond")) return;
        const body = await readJson(request);
        try {
          const updated = ticketService.setTicketStatus(ticketStatusMatch[1], tenantContext.tenantId, body.status, user.id, body.note || "");
          store.save();
          return sendJson(response, 200, enrichTicket(updated));
        } catch (error) {
          return sendJson(response, 400, { error: error.message });
        }
      }

      const ticketTimerMatch = parsedUrl.pathname.match(/^\/api\/tickets\/([^/]+)\/timer$/);
      if (request.method === "POST" && ticketTimerMatch) {
        if (!requirePermission(response, authService, user, "tickets:respond")) return;
        const body = await readJson(request);
        try {
          const updated = ticketService.setTimer(ticketTimerMatch[1], tenantContext.tenantId, body.action, user.id);
          store.save();
          return sendJson(response, 200, enrichTicket(updated));
        } catch (error) {
          return sendJson(response, 400, { error: error.message });
        }
      }

      const ticketMessageMatch = parsedUrl.pathname.match(/^\/api\/tickets\/([^/]+)\/messages$/);
      if (request.method === "POST" && ticketMessageMatch) {
        if (!requirePermission(response, authService, user, "tickets:respond")) return;
        const ticket = ticketService.getTicket(ticketMessageMatch[1], tenantContext.tenantId);
        if (!ticket || !ticket.conversationId) return sendJson(response, 404, { error: "ticket_not_found" });
        const body = await readJson(request);
        const message = await conversationService.sendText(ticket.conversationId, body.body || "", "analyst", tenantContext.tenantId, user.id);
        if (!ticket.firstResponseAt) {
          store.update("tickets", ticket.id, { firstResponseAt: new Date().toISOString() });
        }
        ticketService.addLog(ticket.id, tenantContext.tenantId, {
          type: "reply",
          note: "Analista respondeu ao cliente",
          actor: user.id
        });
        store.save();
        return sendJson(response, 201, message);
      }

      // Nota interna — visível só para a equipe, NÃO vai para o cliente
      const ticketNoteMatch = parsedUrl.pathname.match(/^\/api\/tickets\/([^/]+)\/note$/);
      if (request.method === "POST" && ticketNoteMatch) {
        if (!requirePermission(response, authService, user, "tickets:respond")) return;
        const ticket = ticketService.getTicket(ticketNoteMatch[1], tenantContext.tenantId);
        if (!ticket || !ticket.conversationId) return sendJson(response, 404, { error: "ticket_not_found" });
        const body = await readJson(request);
        const text = String(body.body || "").trim();
        if (!text) return sendJson(response, 400, { error: "note_required" });
        const message = store.insert("messages", {
          tenantId: tenantContext.tenantId,
          conversationId: ticket.conversationId,
          contactId: ticket.contactId,
          direction: "internal",
          channel: "internal",
          type: "note",
          body: text,
          status: "internal",
          actor: user.id,
          authorName: user.name
        });
        ticketService.addLog(ticket.id, tenantContext.tenantId, { type: "note", note: "Nota interna adicionada", actor: user.id });
        store.save();
        return sendJson(response, 201, message);
      }

      // Enviar mídia (imagem/áudio/documento) num atendimento — base64
      const ticketMediaMatch = parsedUrl.pathname.match(/^\/api\/tickets\/([^/]+)\/media$/);
      if (request.method === "POST" && ticketMediaMatch) {
        if (!requirePermission(response, authService, user, "tickets:respond")) return;
        const ticket = ticketService.getTicket(ticketMediaMatch[1], tenantContext.tenantId);
        if (!ticket || !ticket.conversationId) return sendJson(response, 404, { error: "ticket_not_found" });
        const body = await readJson(request);
        const data = String(body.dataBase64 || "").replace(/^data:[^;]+;base64,/, "");
        if (!data) return sendJson(response, 400, { error: "file_required" });
        const buffer = Buffer.from(data, "base64");
        if (buffer.length > 30 * 1024 * 1024) return sendJson(response, 413, { error: "file_too_large", max: "30MB" });
        const mime = String(body.mime || "application/octet-stream");
        const mediaType = mime.startsWith("image/") ? "image" : mime.startsWith("audio/") ? "audio" : mime.startsWith("video/") ? "video" : "document";
        const mediaId = `med_${randomId()}`;
        fileStore.save(mediaId, buffer);
        const message = await conversationService.sendMedia(ticket.conversationId, {
          mediaId, mediaMime: mime, mediaName: String(body.name || mediaType), mediaType, caption: String(body.caption || ""), buffer
        }, "analyst", tenantContext.tenantId, user.id);
        if (!ticket.firstResponseAt) store.update("tickets", ticket.id, { firstResponseAt: new Date().toISOString() });
        ticketService.addLog(ticket.id, tenantContext.tenantId, { type: "reply", note: `Analista enviou ${mediaType}`, actor: user.id });
        store.save();
        return sendJson(response, 201, message);
      }

      // Servir mídia de mensagens (imagens/áudios do chat)
      const mediaMatch = parsedUrl.pathname.match(/^\/api\/media\/([^/]+)$/);
      if (request.method === "GET" && mediaMatch) {
        if (!requirePermission(response, authService, user, "tickets:view")) return;
        const mediaId = mediaMatch[1];
        const msg = store.findOne("messages", (m) => m.mediaId === mediaId && m.tenantId === tenantContext.tenantId);
        if (!msg) return sendJson(response, 404, { error: "media_not_found" });
        const buffer = fileStore.read(mediaId);
        if (!buffer) return sendJson(response, 404, { error: "media_not_found" });
        response.writeHead(200, {
          "Content-Type": msg.mediaMime || "application/octet-stream",
          "Content-Disposition": `inline; filename="${encodeURIComponent(msg.mediaName || "midia")}"`,
          "Content-Length": buffer.length
        });
        return response.end(buffer);
      }

      if (parsedUrl.pathname.startsWith("/api/")) {
        return sendJson(response, 404, { error: "not_found" });
      }

      if (request.method === "GET") {
        return serveStatic(response, publicDir, parsedUrl.pathname);
      }

      return sendJson(response, 404, { error: "not_found" });
    } catch (error) {
      logger.error("platform_request_failed", {
        method: request.method,
        path: parsedUrl.pathname,
        error: error.message,
        stack: error.stack
      });
      if (config.alerts.notifyServerErrors) {
        await alertService?.notifyError({
          title: "Erro HTTP no ALL Assist",
          message: error.message,
          metadata: {
            method: request.method,
            path: parsedUrl.pathname,
            tenantId: tenantContext?.tenantId || "",
            userId: currentUser?.id || ""
          }
        });
      }
      return sendJson(response, 500, { error: "internal_error", message: error.message });
    }
  });

  server.listen(config.port, () => {
    logger.info("platform_server_started", { port: config.port });
  });

  return server;
}

// Campos do cliente (empresa) — dados cadastrais/fiscais. "Cobrança por horas"
// é só um indicador (sem valor monetário nesta fase).
function customerFieldsFromBody(body) {
  return {
    name: String(body.name || "").trim(),
    fantasia: String(body.fantasia || "").trim(),
    cnpj: String(body.cnpj || "").trim(),
    ie: String(body.ie || "").trim(),
    uf: String(body.uf || "").trim().toUpperCase().slice(0, 2),
    regime: String(body.regime || "").trim(),
    atividade: String(body.atividade || "").trim(),
    matrizFilial: body.matrizFilial === "filial" ? "filial" : "matriz",
    blocoK: Boolean(body.blocoK),
    hourlyBilling: Boolean(body.hourlyBilling),
    notes: String(body.notes || "").trim()
  };
}

// Normaliza texto para busca (sem acentos, minúsculo).
function normalizeSearch(value) {
  return String(value || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

// Total de segundos cronometrados num ticket (acumulado + tempo correndo).
function timerSeconds(tt) {
  if (!tt) return 0;
  let total = tt.accumulatedSeconds || 0;
  if (tt.status === "running" && tt.lastStartedAt) {
    total += Math.max(0, Math.floor((Date.now() - new Date(tt.lastStartedAt).getTime()) / 1000));
  }
  return total;
}

// Relatório de horas: agrega o tempo cronometrado dos tickets por cliente e por
// analista no período (filtra por abertura do ticket quando from/to são dados).
function buildHoursReport(store, tenantId, from, to) {
  const fromTs = from ? new Date(from).getTime() : null;
  const toTs = to ? new Date(to).getTime() + 86399999 : null; // fim do dia
  const tickets = store.findAll("tickets", (t) => {
    if (t.tenantId !== tenantId) return false;
    const opened = new Date(t.openedAt).getTime();
    if (fromTs && opened < fromTs) return false;
    if (toTs && opened > toTs) return false;
    return true;
  });
  const contacts = new Map(store.findAll("contacts", (c) => c.tenantId === tenantId).map((c) => [c.id, c]));
  const customers = new Map(store.findAll("customers", (c) => c.tenantId === tenantId).map((c) => [c.id, c]));
  const users = new Map(store.findAll("users", (u) => u.tenantId === tenantId).map((u) => [u.id, u]));

  const byCustomer = new Map();
  const byAnalyst = new Map();
  let totalSeconds = 0;

  for (const t of tickets) {
    const seconds = timerSeconds(t.timeTracking);
    if (seconds <= 0) continue;
    totalSeconds += seconds;

    const contact = contacts.get(t.contactId);
    const customer = contact?.customerId ? customers.get(contact.customerId) : null;
    const custKey = customer?.id || "_none";
    const custName = customer ? (customer.fantasia || customer.name) : "Sem cliente";
    const cur = byCustomer.get(custKey) || { id: customer?.id || null, name: custName, seconds: 0, tickets: 0, hourlyBilling: customer?.hourlyBilling || false };
    cur.seconds += seconds; cur.tickets += 1;
    byCustomer.set(custKey, cur);

    const analyst = t.assignedAnalystId ? users.get(t.assignedAnalystId) : null;
    const anKey = analyst?.id || "_none";
    const anName = analyst?.name || "Não atribuído";
    const a = byAnalyst.get(anKey) || { id: analyst?.id || null, name: anName, seconds: 0, tickets: 0 };
    a.seconds += seconds; a.tickets += 1;
    byAnalyst.set(anKey, a);
  }

  const sortDesc = (arr) => arr.sort((x, y) => y.seconds - x.seconds);
  return {
    totalSeconds,
    byCustomer: sortDesc([...byCustomer.values()]),
    byAnalyst: sortDesc([...byAnalyst.values()])
  };
}

// Monta o painel de atendimento (tickets + conversas) para um tenant.
function buildSupportDashboard(store, tenantId) {
  const tickets = store.list("tickets").filter((t) => t.tenantId === tenantId);
  const conversations = store.list("conversations").filter((c) => c.tenantId === tenantId);
  const contacts = store.list("contacts").filter((c) => c.tenantId === tenantId);

  const openTickets = tickets.filter((t) => t.status !== "closed");
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const closedToday = tickets.filter((t) => t.status === "closed" && t.closedAt && new Date(t.closedAt) >= todayStart);

  const countBy = (items, field) => items.reduce((acc, item) => {
    const key = item[field] || "other";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  // Tempo médio de primeira resposta (minutos) dos tickets que já tiveram resposta
  const responded = tickets.filter((t) => t.firstResponseAt && t.openedAt);
  const avgFirstResponseMins = responded.length
    ? Math.round(
        responded.reduce((sum, t) => sum + (new Date(t.firstResponseAt) - new Date(t.openedAt)), 0) /
          responded.length /
          60000
      )
    : null;

  const now = Date.now();
  const slaAtRisk = openTickets.filter((t) => t.slaDueAt && new Date(t.slaDueAt).getTime() - now < 2 * 3600 * 1000).length;

  return {
    tickets: {
      total: tickets.length,
      open: openTickets.length,
      closedToday: closedToday.length,
      unassigned: openTickets.filter((t) => !t.assignedAnalystId).length,
      slaAtRisk,
      avgFirstResponseMins,
      byStatus: countBy(openTickets, "status"),
      byCategory: countBy(openTickets, "category"),
      byPriority: countBy(openTickets, "priority")
    },
    conversations: {
      total: conversations.length,
      open: conversations.filter((c) => c.status !== "closed").length,
      unread: conversations.reduce((sum, c) => sum + (Number(c.unreadCount) || 0), 0)
    },
    contacts: {
      total: contacts.length
    }
  };
}

async function _createTicketForConversation(conversation, message, contact, ticketService, classifierAgent, store, logger, botAgent = null, conversationService = null) {
  try {
    if (!conversation || !ticketService) return;

    // Verificar se já existe um ticket aberto para essa conversa
    const existingTicket = store.findOne("tickets",
      t => t.conversationId === conversation.id && t.status !== "closed"
    );
    if (existingTicket) return;

    // Classificar a mensagem com a IA
    const classification = classifierAgent
      ? await classifierAgent.classify({
          contactName: contact.name || contact.phone,
          firstMessage: message.body || "[mensagem de mídia]",
          conversationHistory: []
        })
      : null;

    // Criar o ticket
    const ticket = ticketService.createTicket({
      tenantId: conversation.tenantId,
      contactId: contact.id,
      conversationId: conversation.id,
      firstMessage: message.body || "[mensagem de mídia]",
      contactName: contact.name || contact.phone,
      aiClassification: classification
    });

    store.save();
    logger.info("ticket_created_from_webhook", {
      ticketId: ticket.id,
      conversationId: conversation.id,
      category: ticket.category,
      priority: ticket.priority
    });

    // Bot de atendimento inicial (se habilitado no tenant)
    const tenant = store.findById("tenants", conversation.tenantId);
    const botConfig = tenant?.botConfig || {};
    if (botConfig.enabled && botAgent && conversationService) {
      try {
        const articles = store.findAll("kbArticles", (a) => a.tenantId === conversation.tenantId).map((a) => ({
          title: a.title, category: a.category, content: a.content,
          attachmentsText: (a.attachments || []).map((x) => `${x.name} ${x.textExtract || ""}`).join(" ")
        }));
        const result = await botAgent.reply({
          message: message.body || "",
          contactName: contact.name || contact.phone,
          botConfig: { ...botConfig, companyName: tenant?.displayName || tenant?.name },
          articles
        });
        await conversationService.sendText(conversation.id, result.reply, "bot", conversation.tenantId, null);
        ticketService.addLog(ticket.id, conversation.tenantId, { type: "bot_reply", note: `Bot respondeu${result.handoff ? " e encaminhou para análise" : ""}`, actor: "bot" });
        store.update("tickets", ticket.id, {
          firstResponseAt: new Date().toISOString(),
          botHandled: true,
          status: result.handoff ? "waiting_analyst" : "waiting_customer"
        });
        store.save();
        logger.info("bot_handled_ticket", { ticketId: ticket.id, handoff: result.handoff, source: result.source });
      } catch (botError) {
        logger.warn("bot_reply_failed", { error: botError.message, ticketId: ticket.id });
      }
    }
  } catch (error) {
    logger.error("ticket_creation_failed", {
      error: error.message,
      conversationId: conversation?.id
    });
  }
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function numberParam(parsedUrl, name, fallback) {
  const value = Number.parseInt(parsedUrl.searchParams.get(name) || "", 10);
  return Number.isFinite(value) ? value : fallback;
}

function readLogTail(filePath, limit = 200) {
  if (!filePath || !fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean);
  return lines.slice(-Math.max(1, Math.min(limit, 1000))).map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return { raw: line };
    }
  }).reverse();
}

function redirect(response, location) {
  response.writeHead(302, { Location: location });
  response.end();
}

function requirePermission(response, authService, user, permission) {
  if (authService.hasPermission(user, permission)) return true;
  sendJson(response, 403, { error: "forbidden", permission });
  return false;
}

function exceedsUserLimit(store, tenantId) {
  const tenant = store.findById("tenants", tenantId);
  const limit = Number.parseInt(tenant?.userLimit || "0", 10);
  if (!Number.isFinite(limit) || limit <= 0) return false;
  const activeUsers = store.list("users").filter((item) => item.tenantId === tenantId && item.status === "active").length;
  return activeUsers >= limit;
}

function isPublicRequest(request, parsedUrl) {
  if (parsedUrl.pathname === "/healthz" || parsedUrl.pathname === "/readyz") return true;
  if (parsedUrl.pathname === "/login.html") return true;
  if (parsedUrl.pathname === "/login.css" || parsedUrl.pathname === "/login.js") return true;
  if (parsedUrl.pathname === "/accept-invite.html" || parsedUrl.pathname === "/accept-invite.js") return true;
  if (parsedUrl.pathname === "/verify-email.html" || parsedUrl.pathname === "/verify-email.js") return true;
  if (parsedUrl.pathname === "/manifest.webmanifest" || parsedUrl.pathname === "/icon.svg" || parsedUrl.pathname === "/service-worker.js") return true;
  if (parsedUrl.pathname === "/api/auth/login") return true;
  if (parsedUrl.pathname === "/api/auth/invites/accept") return true;
  if (parsedUrl.pathname === "/api/auth/email/verify") return true;
  if (parsedUrl.pathname === "/webhooks/meta/whatsapp") return true;
  if (parsedUrl.pathname === "/webhooks/evolution") return true;
  return false;
}

function readCookie(request, name) {
  const cookie = request.headers.cookie || "";
  const parts = cookie.split(";").map((part) => part.trim());
  const found = parts.find((part) => part.startsWith(`${name}=`));
  return found ? decodeURIComponent(found.slice(name.length + 1)) : "";
}

function setSessionCookie(response, token, ttlHours) {
  const maxAge = Math.max(1, Number(ttlHours || 12)) * 60 * 60;
  response.setHeader("Set-Cookie", `allassist_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`);
}

function clearSessionCookie(response) {
  response.setHeader("Set-Cookie", "allassist_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
}

function setActiveTenantCookie(response, config, tenantId) {
  response.setHeader("Set-Cookie", `${config.saas.activeTenantCookie}=${encodeURIComponent(tenantId)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`);
}

function clearActiveTenantCookie(response, config) {
  response.setHeader("Set-Cookie", `${config.saas.activeTenantCookie}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

function publicTenantContext(context) {
  if (!context) return null;
  return {
    tenant: context.tenant ? sanitizeTenant(context.tenant) : null,
    hostTenant: context.hostTenant ? sanitizeTenant(context.hostTenant) : null,
    tenantSource: context.tenantSource,
    hostTenantSlug: context.hostTenantSlug,
    isMaster: context.isMaster,
    isMasterDomain: context.isMasterDomain,
    isUnknownTenantHost: context.isUnknownTenantHost
  };
}

function sanitizeTenant(tenant) {
  const { metadata, ...safe } = tenant;
  return safe;
}

async function readJson(request) {
  const raw = await readRawBody(request);
  if (!raw.length) return {};
  return JSON.parse(raw.toString("utf8"));
}

function readRawBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

function serveStatic(response, publicDir, requestPath) {
  const safePath = requestPath === "/" ? "/index.html" : requestPath;
  const filePath = path.resolve(publicDir, `.${safePath}`);
  if (!filePath.startsWith(publicDir)) return sendJson(response, 403, { error: "forbidden" });

  const finalPath = fs.existsSync(filePath) && fs.statSync(filePath).isFile()
    ? filePath
    : path.join(publicDir, "index.html");

  const contentType = contentTypeFor(finalPath);
  const headers = { "Content-Type": contentType };
  if ((process.env.NODE_ENV || "development") !== "production") {
    headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0";
    headers.Pragma = "no-cache";
    headers.Expires = "0";
  }
  response.writeHead(200, headers);
  response.end(fs.readFileSync(finalPath));
}

function contentTypeFor(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  if (filePath.endsWith(".webmanifest")) return "application/manifest+json; charset=utf-8";
  return "application/octet-stream";
}
