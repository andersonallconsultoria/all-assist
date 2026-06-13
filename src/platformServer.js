import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { URL } from "node:url";
import { assertTenantAccess, resolveTenantContext } from "./tenantContext.js";

export function startPlatformServer({ config, logger, store, crmService, conversationService, localSyncService, whatsappClient, authService, erpIntegrationService, observabilityService, tenantService, commercialStructureService, accessRoleService, userOnboardingService, integrationScheduleService, alertService, evolutionInstanceService }) {
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
      const user = authService.getSessionUser(readCookie(request, "neuraxcrm_session"));
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
        authService.revokeSession(readCookie(request, "neuraxcrm_session"));
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
        return sendJson(response, 200, crmService.getDashboard(tenantContext.tenantId));
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

      const tenantStructureMatch = parsedUrl.pathname.match(/^\/api\/support\/tenants\/([^/]+)\/structure$/);
      if (request.method === "GET" && tenantStructureMatch) {
        if (!requirePermission(response, authService, user, "support:tenants")) return;
        try {
          return sendJson(response, 200, commercialStructureService.getTenantStructure(tenantStructureMatch[1]));
        } catch (error) {
          return sendJson(response, 404, { error: error.message });
        }
      }

      const tenantGroupsMatch = parsedUrl.pathname.match(/^\/api\/support\/tenants\/([^/]+)\/groups$/);
      if (request.method === "POST" && tenantGroupsMatch) {
        if (!requirePermission(response, authService, user, "support:tenants")) return;
        try {
          const group = commercialStructureService.createCompanyGroup({
            ...(await readJson(request)),
            tenantId: tenantGroupsMatch[1]
          }, user);
          observabilityService?.recordAudit({
            tenantId: group.tenantId,
            userId: user.id,
            action: "tenant.company_group.created",
            entityType: "companyGroup",
            entityId: group.id
          });
          store.save();
          return sendJson(response, 201, group);
        } catch (error) {
          return sendJson(response, 400, { error: error.message });
        }
      }

      const tenantCompaniesMatch = parsedUrl.pathname.match(/^\/api\/support\/tenants\/([^/]+)\/companies$/);
      if (request.method === "POST" && tenantCompaniesMatch) {
        if (!requirePermission(response, authService, user, "support:tenants")) return;
        try {
          const company = commercialStructureService.createCompany({
            ...(await readJson(request)),
            tenantId: tenantCompaniesMatch[1]
          }, user);
          observabilityService?.recordAudit({
            tenantId: company.tenantId,
            userId: user.id,
            action: "tenant.company.created",
            entityType: "tenantCompany",
            entityId: company.id
          });
          store.save();
          return sendJson(response, 201, company);
        } catch (error) {
          return sendJson(response, 400, { error: error.message });
        }
      }

      const tenantSalesPeopleMatch = parsedUrl.pathname.match(/^\/api\/support\/tenants\/([^/]+)\/sales-people$/);
      if (request.method === "POST" && tenantSalesPeopleMatch) {
        if (!requirePermission(response, authService, user, "support:tenants")) return;
        try {
          const salesPerson = commercialStructureService.createSalesPerson({
            ...(await readJson(request)),
            tenantId: tenantSalesPeopleMatch[1]
          }, user);
          observabilityService?.recordAudit({
            tenantId: salesPerson.tenantId,
            userId: user.id,
            action: "tenant.sales_person.created",
            entityType: "salesPerson",
            entityId: salesPerson.id
          });
          store.save();
          return sendJson(response, 201, salesPerson);
        } catch (error) {
          return sendJson(response, 400, { error: error.message });
        }
      }

      const userScopeMatch = parsedUrl.pathname.match(/^\/api\/support\/users\/([^/]+)\/access-scope$/);
      if (request.method === "PUT" && userScopeMatch) {
        if (!requirePermission(response, authService, user, "support:tenants")) return;
        try {
          const updatedUser = commercialStructureService.setUserScope(userScopeMatch[1], await readJson(request), user);
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

      if (request.method === "GET" && parsedUrl.pathname === "/api/integrations/erp") {
        if (!requirePermission(response, authService, user, "settings:manage")) return;
        return sendJson(response, 200, erpIntegrationService.getPublicSettings(tenantContext.tenantId));
      }

      if (request.method === "GET" && parsedUrl.pathname === "/api/integrations/schedules") {
        if (!requirePermission(response, authService, user, "settings:manage")) return;
        return sendJson(response, 200, {
          data: integrationScheduleService.listSchedules(tenantContext.tenantId)
        });
      }

      const integrationScheduleMatch = parsedUrl.pathname.match(/^\/api\/integrations\/schedules\/([^/]+)$/);
      if (request.method === "PUT" && integrationScheduleMatch) {
        if (!requirePermission(response, authService, user, "settings:manage")) return;
        try {
          const schedule = integrationScheduleService.updateSchedule(
            tenantContext.tenantId,
            integrationScheduleMatch[1],
            await readJson(request),
            user
          );
          observabilityService?.recordAudit({
            tenantId: tenantContext.tenantId,
            userId: user.id,
            action: "integration.schedule.updated",
            entityType: "integrationSchedule",
            entityId: schedule.id || schedule.entityType,
            metadata: {
              entityType: schedule.entityType,
              intervalMinutes: schedule.intervalMinutes,
              strategy: schedule.strategy
            }
          });
          store.save();
          return sendJson(response, 200, schedule);
        } catch (error) {
          return sendJson(response, 400, { error: error.message });
        }
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

      if (request.method === "PUT" && parsedUrl.pathname === "/api/integrations/erp") {
        if (!requirePermission(response, authService, user, "settings:manage")) return;
        const body = await readJson(request);
        const settings = erpIntegrationService.updateSettings(body, { ...user, tenantId: tenantContext.tenantId });
        observabilityService?.recordAudit({
          tenantId: tenantContext.tenantId,
          userId: user.id,
          action: "integration.erp.settings.updated",
          entityType: "integration",
          entityId: "erp",
          metadata: {
            host: settings.host,
            port: settings.port,
            idEmpresa: settings.idEmpresa
          }
        });
        store.save();
        return sendJson(response, 200, settings);
      }

      if (request.method === "DELETE" && parsedUrl.pathname === "/api/integrations/erp") {
        if (!requirePermission(response, authService, user, "settings:manage")) return;
        const settings = erpIntegrationService.clearSettings({ ...user, tenantId: tenantContext.tenantId });
        observabilityService?.recordAudit({
          tenantId: tenantContext.tenantId,
          userId: user.id,
          action: "integration.erp.settings.cleared",
          entityType: "integration",
          entityId: "erp"
        });
        store.save();
        return sendJson(response, 200, settings);
      }

      if (request.method === "POST" && parsedUrl.pathname === "/api/integrations/erp/test") {
        if (!requirePermission(response, authService, user, "settings:manage")) return;
        const body = await readJson(request);
        try {
          const result = await erpIntegrationService.testConnection(body, tenantContext.tenantId);
          observabilityService?.recordAudit({
            tenantId: tenantContext.tenantId,
            userId: user.id,
            action: "integration.erp.connection_tested",
            entityType: "integration",
            entityId: "erp",
            metadata: {
              host: result.baseUrl,
              provider: result.provider
            }
          });
          store.save();
          return sendJson(response, 200, result);
        } catch (error) {
          observabilityService?.recordAudit({
            tenantId: tenantContext.tenantId,
            userId: user.id,
            action: "integration.erp.connection_test_failed",
            entityType: "integration",
            entityId: "erp",
            metadata: {
              error: error.message
            }
          });
          store.save();
          if (config.alerts.notifyIntegrationFailures) {
            await alertService?.notifyError({
              title: "Falha no teste de conexao ERP",
              message: error.message,
              metadata: {
                tenantId: tenantContext.tenantId,
                userId: user.id,
                path: parsedUrl.pathname
              }
            });
          }
          return sendJson(response, 400, { error: error.message });
        }
      }

      if (request.method === "GET" && parsedUrl.pathname === "/api/contacts") {
        if (!requirePermission(response, authService, user, "contacts:view")) return;
        return sendJson(response, 200, {
          data: store
            .list("contacts")
            .filter((contact) => contact.tenantId === tenantContext.tenantId)
            .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
        });
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
        const updated = store.update("contacts", contactId, patch);
        if (patch.phone !== undefined) {
          store.data.deals
            .filter((d) => d.tenantId === tenantContext.tenantId && d.contactId === contactId)
            .forEach((d) => { d.contactPhone = patch.phone; d.updatedAt = new Date().toISOString(); });
        }
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

      if (request.method === "GET" && parsedUrl.pathname === "/api/pipelines") {
        if (!requirePermission(response, authService, user, "deals:view")) return;
        return sendJson(response, 200, {
          data: crmService.listPipelines(tenantContext.tenantId)
        });
      }

      if (request.method === "POST" && parsedUrl.pathname === "/api/pipelines") {
        if (!requirePermission(response, authService, user, "deals:write")) return;
        try {
          const pipeline = crmService.createPipeline(await readJson(request), tenantContext.tenantId);
          observabilityService?.recordAudit({
            tenantId: tenantContext.tenantId,
            userId: user.id,
            action: "pipeline.created",
            entityType: "pipeline",
            entityId: pipeline.id
          });
          return sendJson(response, 201, pipeline);
        } catch (error) {
          return sendJson(response, 400, { error: error.message });
        }
      }

      const pipelineMatch = parsedUrl.pathname.match(/^\/api\/pipelines\/([^/]+)$/);
      if (request.method === "PUT" && pipelineMatch) {
        if (!requirePermission(response, authService, user, "deals:write")) return;
        try {
          const pipeline = crmService.updatePipeline(pipelineMatch[1], await readJson(request), tenantContext.tenantId);
          if (!pipeline) return sendJson(response, 404, { error: "pipeline_not_found" });
          observabilityService?.recordAudit({
            tenantId: tenantContext.tenantId,
            userId: user.id,
            action: "pipeline.updated",
            entityType: "pipeline",
            entityId: pipeline.id
          });
          return sendJson(response, 200, pipeline);
        } catch (error) {
          return sendJson(response, 400, { error: error.message });
        }
      }

      if (request.method === "GET" && parsedUrl.pathname === "/api/sellers") {
        if (!requirePermission(response, authService, user, "deals:view")) return;
        const deals = store.list("deals").filter((d) => d.tenantId === tenantContext.tenantId);
        const salesPeople = store.list("salesPeople").filter((s) => s.tenantId === tenantContext.tenantId);

        const statsMap = new Map();
        for (const deal of deals) {
          const key = deal.assignedSeller || "Sem vendedor";
          if (!statsMap.has(key)) statsMap.set(key, { name: key, total: 0, won: 0, revenue: 0, openAmount: 0 });
          const s = statsMap.get(key);
          s.total++;
          const isWon = deal.stage === "won" || deal.wonAt;
          if (isWon) { s.won++; s.revenue += Number(deal.amount || 0); }
          else { s.openAmount += Number(deal.amount || 0); }
        }

        const sellers = salesPeople.map((sp) => {
          const stats = statsMap.get(sp.name) || { total: 0, won: 0, revenue: 0, openAmount: 0 };
          statsMap.delete(sp.name);
          return { ...sp, ...stats, conversionRate: stats.total ? ((stats.won / stats.total) * 100).toFixed(1) : "0.0" };
        });

        for (const [name, stats] of statsMap) {
          sellers.push({ id: name, name, type: "seller", status: "active", ...stats, conversionRate: stats.total ? ((stats.won / stats.total) * 100).toFixed(1) : "0.0" });
        }

        return sendJson(response, 200, { data: sellers.sort((a, b) => b.revenue - a.revenue) });
      }

      if (request.method === "GET" && parsedUrl.pathname === "/api/deals") {
        if (!requirePermission(response, authService, user, "deals:view")) return;
        return sendJson(response, 200, {
          data: crmService.listDeals(Object.fromEntries(parsedUrl.searchParams.entries()), tenantContext.tenantId)
        });
      }

      const dealMatch = parsedUrl.pathname.match(/^\/api\/deals\/([^/]+)$/);
      if (request.method === "GET" && dealMatch) {
        if (!requirePermission(response, authService, user, "deals:view")) return;
        const deal = crmService.getDeal(dealMatch[1], tenantContext.tenantId);
        return deal ? sendJson(response, 200, deal) : sendJson(response, 404, { error: "deal_not_found" });
      }

      if (request.method === "PATCH" && dealMatch) {
        if (!requirePermission(response, authService, user, "deals:write")) return;
        const deal = store.findById("deals", dealMatch[1]);
        if (!deal || deal.tenantId !== tenantContext.tenantId) return sendJson(response, 404, { error: "deal_not_found" });
        const body = await readJson(request);
        const allowed = ["stage", "pipelineId", "assignedSeller", "amount", "title", "notes"];
        const patch = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));
        if (!Object.keys(patch).length) return sendJson(response, 400, { error: "no_valid_fields" });
        const updated = store.update("deals", deal.id, patch);
        observabilityService?.recordAudit({
          tenantId: tenantContext.tenantId,
          userId: user.id,
          action: "deal.updated",
          entityType: "deal",
          entityId: deal.id,
          metadata: patch
        });
        store.save();
        return sendJson(response, 200, updated);
      }

      const dealLogsMatch = parsedUrl.pathname.match(/^\/api\/deals\/([^/]+)\/logs$/);
      if (request.method === "POST" && dealLogsMatch) {
        if (!requirePermission(response, authService, user, "deals:write")) return;
        const body = await readJson(request);
        const log = crmService.addDealLog(dealLogsMatch[1], body, tenantContext.tenantId);
        if (!log) return sendJson(response, 404, { error: "deal_not_found" });
        observabilityService?.recordAudit({
          tenantId: tenantContext.tenantId,
          userId: user.id,
          action: "deal.log.created",
          entityType: "deal",
          entityId: dealLogsMatch[1],
          metadata: {
            type: body.type || "note"
          }
        });
        store.save();
        return sendJson(response, 201, log);
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

      if (request.method === "POST" && ["/api/erp/sync/run", "/api/ciss/sync/run"].includes(parsedUrl.pathname)) {
        if (!requirePermission(response, authService, user, "settings:manage")) return;
        erpIntegrationService.applyStoredSettings(tenantContext.tenantId);
        try {
          const stats = await localSyncService.runOnce({ tenantId: tenantContext.tenantId });
          observabilityService?.recordAudit({
            tenantId: tenantContext.tenantId,
            userId: user.id,
            action: "integration.erp.manual_sync",
            entityType: "integration",
            entityId: "erp",
            metadata: { stats }
          });
          store.save();
          return sendJson(response, 200, stats);
        } catch (syncError) {
          logger.error("erp_manual_sync_failed", { error: syncError.message, tenantId: tenantContext.tenantId });
          return sendJson(response, 400, { error: syncError.message });
        }
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
        const text = String(body.text || "Mensagem de teste do Neurax CRM 🚀").trim();
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
          title: "Erro HTTP no Neurax CRM",
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
  response.setHeader("Set-Cookie", `neuraxcrm_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`);
}

function clearSessionCookie(response) {
  response.setHeader("Set-Cookie", "neuraxcrm_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
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
