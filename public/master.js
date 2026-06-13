const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const state = {
  user: null,
  overview: null,
  tenants: [],
  logs: [],
  query: "",
  permissionCatalog: [],
  structureTenantId: "",
  structure: null,
  structureRoles: [],
  structureUsers: []
};

document.querySelectorAll(".master-sidebar nav a").forEach((link) => {
  link.addEventListener("click", () => {
    document.querySelectorAll(".master-sidebar nav a").forEach((item) => item.classList.remove("active"));
    document.querySelectorAll(".master-section").forEach((item) => item.classList.remove("active"));
    link.classList.add("active");
    document.querySelector(link.getAttribute("href")).classList.add("active");
  });
});

document.getElementById("refreshButton").addEventListener("click", loadAll);
document.getElementById("tenantSearch").addEventListener("input", (event) => {
  state.query = event.target.value.toLowerCase();
  renderTenants();
  renderBilling();
  renderUsage();
  renderLgpd();
});

document.getElementById("tenantForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  await createTenant(event.currentTarget);
});

document.getElementById("structureTenantSelect")?.addEventListener("change", async (event) => {
  state.structureTenantId = event.target.value;
  await loadStructureData();
  renderStructure();
});

document.getElementById("structureReloadButton")?.addEventListener("click", async () => {
  await loadStructureData();
  renderStructure();
});

document.getElementById("groupForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  await createCompanyGroup(event.currentTarget);
});

document.getElementById("companyForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  await createCompany(event.currentTarget);
});

document.getElementById("salesPersonForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  await createSalesPerson(event.currentTarget);
});

document.getElementById("roleForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  await createRole(event.currentTarget);
});

document.getElementById("inviteForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  await createInvite(event.currentTarget);
});

document.getElementById("logoutButton").addEventListener("click", async () => {
  await api("/api/auth/logout", { method: "POST" });
  window.location.href = "/login.html?next=/master.html";
});

async function loadAll() {
  const me = await api("/api/auth/me");
  state.user = me.user;
  if (!hasPermission("support:tenants")) {
    window.location.href = "/";
    return;
  }

  const [overview, tenants, integrationEvents, requestMetrics, permissionCatalog] = await Promise.all([
    api("/api/support/overview"),
    api("/api/support/tenants"),
    api("/api/support/integration-events?limit=80").catch(() => ({ data: [] })),
    api("/api/support/request-metrics?limit=150").catch(() => ({ data: [] })),
    api("/api/permissions/catalog").catch(() => ({ data: [] }))
  ]);

  state.overview = {
    ...overview,
    recentIntegrationEvents: integrationEvents.data || overview.recentIntegrationEvents || [],
    requestMetrics: requestMetrics.data || []
  };
  state.tenants = tenants.data || [];
  state.permissionCatalog = permissionCatalog.data || [];
  if (!state.structureTenantId || !state.tenants.some((tenant) => tenant.id === state.structureTenantId)) {
    state.structureTenantId = state.tenants[0]?.id || "";
  }
  await loadStructureData();
  renderAll();
}

async function loadStructureData() {
  if (!state.structureTenantId) {
    state.structure = null;
    state.structureRoles = [];
    state.structureUsers = [];
    return;
  }

  const tenantId = encodeURIComponent(state.structureTenantId);
  const [structure, roles, users] = await Promise.all([
    api(`/api/support/tenants/${tenantId}/structure`).catch(() => null),
    api(`/api/roles?tenantId=${tenantId}`).catch(() => ({ data: [] })),
    api(`/api/users?tenantId=${tenantId}`).catch(() => ({ data: [] }))
  ]);
  state.structure = structure;
  state.structureRoles = roles.data || [];
  state.structureUsers = users.data || [];
}

function renderAll() {
  document.getElementById("masterUser").textContent = state.user?.name || "Master";
  renderKpis();
  renderPlanChart();
  renderHealth();
  renderTenants();
  renderBilling();
  renderUsage();
  renderStructure();
  renderIntegrations();
  renderLgpd();
  renderWaTenantSelect();
}

function renderKpis() {
  const tenants = state.tenants;
  const revenue = tenants.reduce((sum, tenant) => sum + Number(tenant.usage?.estimatedMonthlyValue || 0), 0);
  const active = tenants.filter((tenant) => tenant.status === "active").length;
  const attention = tenants.filter((tenant) => (
    ["blocked", "paused"].includes(tenant.status)
    || ["overdue", "suspended", "canceled"].includes(tenant.billingStatus)
  )).length;
  const accesses = tenants.reduce((sum, tenant) => sum + Number(tenant.usage?.accessCount || 0), 0);

  document.getElementById("kpiRevenue").textContent = money.format(revenue);
  document.getElementById("kpiActiveTenants").textContent = active;
  document.getElementById("kpiTenantTotal").textContent = `${tenants.length} clientes cadastrados`;
  document.getElementById("kpiOverdue").textContent = attention;
  document.getElementById("kpiAccesses").textContent = accesses;
}

function renderPlanChart() {
  const counts = countBy(state.tenants, (tenant) => planLabel(tenant.plan || "sem plano"));
  const max = Math.max(1, ...Object.values(counts));
  document.getElementById("planChart").innerHTML = Object.entries(counts).length
    ? Object.entries(counts).map(([plan, count]) => `
      <div class="bar-item">
        <strong>${escapeHtml(plan)}</strong>
        <span class="bar"><i style="width:${Math.round((count / max) * 100)}%"></i></span>
        <span>${count}</span>
      </div>
    `).join("")
    : empty("Nenhum cliente cadastrado ainda.");
}

function renderHealth() {
  const failures = state.tenants.reduce((sum, tenant) => sum + Number(tenant.usage?.integrationFailures || 0), 0);
  const slow = state.tenants.reduce((sum, tenant) => sum + Number(tenant.usage?.slowRequests || 0), 0);
  const blocked = state.tenants.filter((tenant) => tenant.status === "blocked" || tenant.billingStatus === "suspended").length;
  const whatsappPending = state.tenants.filter((tenant) => tenant.whatsapp?.status !== "connected").length;
  const items = [
    ["Falhas em integrações", failures, failures ? "danger" : ""],
    ["Rotas com lentidão", slow, slow ? "warn" : ""],
    ["Clientes sem acesso", blocked, blocked ? "danger" : ""],
    ["WhatsApp pendente", whatsappPending, whatsappPending ? "warn" : ""]
  ];

  document.getElementById("healthList").innerHTML = items.map(([label, value, status]) => `
    <div class="health-item">
      <strong>${label}</strong>
      <span class="status ${status}">${value}</span>
    </div>
  `).join("");
}

function renderTenants() {
  const tenants = filteredTenants();
  document.getElementById("tenantList").innerHTML = tenants.length
    ? tenants.map((tenant) => `
      <article class="tenant-card">
        <header class="tenant-card-head">
          <div>
            <h3>${escapeHtml(tenant.name)}</h3>
            <small>${escapeHtml(tenant.slug)}.crm.neurax.com.br</small>
          </div>
          <div class="tenant-badges">
            <span class="status ${statusClass(tenant.status)}">${statusLabel(tenant.status)}</span>
            <span class="status ${billingClass(tenant.billingStatus)}">${billingLabel(tenant.billingStatus)}</span>
          </div>
        </header>
        <div class="tenant-card-summary">
          <span><strong>${planLabel(tenant.plan)}</strong><small>Plano</small></span>
          <span><strong>${tenant.usage?.activeUsers || 0}/${tenant.usage?.userLimit || 0}</strong><small>Usuários ativos</small></span>
          <span><strong>${money.format(Number(tenant.usage?.estimatedMonthlyValue || 0))}</strong><small>MRR previsto</small></span>
        </div>
        <p class="tenant-meta">Responsável: ${escapeHtml(tenant.contactName || "não informado")} &middot; Cobrança: ${escapeHtml(tenant.billingEmail || "sem email")}</p>
        ${tenant.status === "implantacao" ? `
        <div class="sync-config-panel" id="sync-panel-${escapeHtml(tenant.id)}">
          <strong>Sincronização de implantação</strong>
          <p>Defina o intervalo de datas para carregar pedidos do ERP neste cliente.</p>
          <div class="sync-config-fields">
            <label><span>Data inicial</span><input type="date" id="sync-dtini-${escapeHtml(tenant.id)}" placeholder="DD/MM/AAAA"></label>
            <label><span>Data final</span><input type="date" id="sync-dtfim-${escapeHtml(tenant.id)}" placeholder="DD/MM/AAAA"></label>
            <label><span>ID da empresa (ERP)</span><input type="number" id="sync-idempresa-${escapeHtml(tenant.id)}" placeholder="1" min="1"></label>
          </div>
          <div class="sync-config-actions">
            <button type="button" data-action="save-sync-config" data-id="${escapeHtml(tenant.id)}">Salvar intervalo</button>
            <button type="button" data-action="run-sync" data-id="${escapeHtml(tenant.id)}">Sincronizar agora</button>
            <span class="sync-config-result" id="sync-result-${escapeHtml(tenant.id)}"></span>
          </div>
        </div>
        ` : ""}
        <div class="tenant-actions">
          <button class="primary" type="button" data-action="access" data-id="${escapeHtml(tenant.id)}">Acessar ambiente</button>
          <button type="button" data-action="config-erp" data-id="${escapeHtml(tenant.id)}">Configurar ERP</button>
          <button type="button" data-action="config-whatsapp" data-id="${escapeHtml(tenant.id)}">Configurar WhatsApp</button>
          <button type="button" data-action="clear-crm" data-id="${escapeHtml(tenant.id)}" data-name="${escapeHtml(tenant.name)}" style="color:var(--danger,#e74c3c)">Limpar CRM</button>
          <button type="button" data-action="set-implantacao" data-id="${escapeHtml(tenant.id)}">Em implantação</button>
          <button type="button" data-action="set-producao" data-id="${escapeHtml(tenant.id)}">Em produção</button>
          <button type="button" data-action="activate" data-id="${escapeHtml(tenant.id)}">Ativar</button>
          <button type="button" data-action="overdue" data-id="${escapeHtml(tenant.id)}">Marcar em atraso</button>
          <button type="button" data-action="block" data-id="${escapeHtml(tenant.id)}">Bloquear</button>
          <button type="button" data-action="suspend" data-id="${escapeHtml(tenant.id)}">Suspender por cobrança</button>
        </div>
      </article>
    `).join("")
    : empty("Nenhum cliente encontrado com esse filtro.");

  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => handleTenantAction(button.dataset.action, button.dataset.id));
  });

  filteredTenants()
    .filter((t) => t.status === "implantacao")
    .forEach(async (tenant) => {
      try {
        const settings = await api(`/api/support/tenants/${encodeURIComponent(tenant.id)}/sync-config`);
        const dtIniEl = document.getElementById(`sync-dtini-${tenant.id}`);
        const dtFimEl = document.getElementById(`sync-dtfim-${tenant.id}`);
        const idEmpresaEl = document.getElementById(`sync-idempresa-${tenant.id}`);
        if (dtIniEl && settings.dtIni) dtIniEl.value = settings.dtIni;
        if (dtFimEl && settings.dtFim) dtFimEl.value = settings.dtFim;
        if (idEmpresaEl && settings.idEmpresa) idEmpresaEl.value = settings.idEmpresa;
      } catch (_) { /* sem config salva ainda, campos ficam vazios */ }
    });
}

function renderBilling() {
  const rows = filteredTenants().map((tenant) => `
    <article class="billing-card">
      <header>
        <div>
          <h3>${escapeHtml(tenant.name)}</h3>
          <p>${escapeHtml(tenant.billingEmail || tenant.contactEmail || "sem email financeiro")}</p>
        </div>
        <div class="tenant-badges">
          <span class="status">${planLabel(tenant.plan)}</span>
          <span class="status ${billingClass(tenant.billingStatus)}">${billingLabel(tenant.billingStatus)}</span>
        </div>
      </header>
      <div class="metric-grid">
        <div><span>Mensalidade base</span><strong>${money.format(Number(tenant.monthlyBasePrice || 0))}</strong></div>
        <div><span>Valor por usuário</span><strong>${money.format(Number(tenant.pricePerUser || 0))}</strong></div>
        <div><span>Usuários ativos</span><strong>${tenant.usage?.activeUsers || 0}/${tenant.usage?.userLimit || 0}</strong></div>
        <div><span>Total previsto</span><strong>${money.format(Number(tenant.usage?.estimatedMonthlyValue || 0))}</strong></div>
      </div>
      <footer>
        <span>Vencimento: ${tenant.billingDay ? `dia ${tenant.billingDay}` : "não configurado"}</span>
        <span>Status do cliente: ${statusLabel(tenant.status)}</span>
        <span>Último acesso: ${formatDateTime(tenant.usage?.lastAccessAt) || "ainda sem login"}</span>
      </footer>
    </article>
  `);
  document.getElementById("billingTable").innerHTML = rows.length ? rows.join("") : empty("Sem dados de cobrança.");
}

function renderUsage() {
  const rows = filteredTenants().map((tenant) => `
    <article class="usage-card">
      <header>
        <div>
          <strong>${escapeHtml(tenant.name)}</strong>
          <small>Último acesso: ${formatDateTime(tenant.usage?.lastAccessAt) || "sem acesso registrado"}</small>
        </div>
        <span class="status ${statusClass(tenant.status)}">${statusLabel(tenant.status)}</span>
      </header>
      <div class="usage-metrics">
        <span><strong>${tenant.usage?.activeUsers || 0}/${tenant.usage?.userLimit || 0}</strong><small>Usuários ativos</small></span>
        <span><strong>${tenant.usage?.accessCount || 0}</strong><small>Acessos</small></span>
        <span><strong>${tenant.usage?.requests || 0}</strong><small>Requisições</small></span>
        <span><strong>${tenant.usage?.whatsappMessages || 0}</strong><small>Mensagens WhatsApp</small></span>
      </div>
    </article>
  `);
  document.getElementById("usageTable").innerHTML = rows.length ? rows.join("") : empty("Sem uso registrado.");
}

function renderIntegrations() {
  const events = state.overview?.recentIntegrationEvents || [];
  document.getElementById("integrationEvents").innerHTML = events.length
    ? events.slice(0, 30).map((event) => `
      <div class="event-item">
        <div>
          <strong>${escapeHtml(event.message || event.action || "Evento")}</strong>
          <p>${escapeHtml(event.sourceKey || event.provider || "")}</p>
          <small>${formatDateTime(event.createdAt)}</small>
        </div>
        <span class="status ${event.status === "failed" ? "danger" : ""}">${eventStatusLabel(event.status)}</span>
      </div>
    `).join("")
    : empty("Sem eventos recentes.");

  const stats = state.overview?.requestStats || [];
  document.getElementById("requestStats").innerHTML = stats.length
    ? stats.map((item) => `
      <div class="event-item">
        <div>
          <strong>${escapeHtml(item.route)}</strong>
          <p>${item.count} chamadas, ${item.errors} erros, ${item.slow} lentas</p>
        </div>
        <span>${item.avgDurationMs}ms</span>
      </div>
    `).join("")
    : empty("Sem métricas de API por enquanto.");
}

function renderLgpd() {
  const rows = filteredTenants().map((tenant) => `
    <div class="table-row">
      <div><strong>${escapeHtml(tenant.name)}</strong><small>${escapeHtml(tenant.document || "documento não informado")}</small></div>
      <div><strong>${escapeHtml(tenant.lgpd?.dpoName || "Não informado")}</strong><small>DPO</small></div>
      <div><strong>${escapeHtml(tenant.lgpd?.dpoEmail || "Não informado")}</strong><small>email LGPD</small></div>
      <div><strong>${tenant.lgpd?.retentionDays || 0} dias</strong><small>retenção dos dados</small></div>
      <div><span class="status ${tenant.lgpd?.dataProcessingAgreementSigned ? "" : "warn"}">${tenant.lgpd?.dataProcessingAgreementSigned ? "Contrato OK" : "Pendente"}</span></div>
    </div>
  `);
  document.getElementById("lgpdTable").innerHTML = rows.length ? rows.join("") : empty("Sem dados LGPD.");
}

function renderStructure() {
  const tenantSelect = document.getElementById("structureTenantSelect");
  if (!tenantSelect) return;

  tenantSelect.innerHTML = state.tenants.length
    ? state.tenants.map((tenant) => `<option value="${escapeHtml(tenant.id)}">${escapeHtml(tenant.name)} (${escapeHtml(tenant.slug)})</option>`).join("")
    : "<option value=\"\">Nenhum cliente cadastrado</option>";
  tenantSelect.value = state.structureTenantId || "";

  renderGroupSelects();
  renderCompanySelects();
  renderSupervisorSelect();
  renderPermissionList();
  renderRoleSelect();
  renderStructureLists();
}

function renderGroupSelects() {
  const groups = state.structure?.groups || [];
  const options = groups.length
    ? groups.map((group) => `<option value="${escapeHtml(group.id)}">${escapeHtml(group.name)}</option>`).join("")
    : "<option value=\"\">Crie um grupo primeiro</option>";
  const companyGroupSelect = document.getElementById("companyGroupSelect");
  if (companyGroupSelect) companyGroupSelect.innerHTML = options;
  const salesGroupSelect = document.getElementById("salesGroupSelect");
  if (salesGroupSelect) salesGroupSelect.innerHTML = options;
}

function renderCompanySelects() {
  const companies = state.structure?.companies || [];
  const options = companies.length
    ? companies.map((company) => `<option value="${escapeHtml(company.id)}">${escapeHtml(company.tradeName || company.legalName)}</option>`).join("")
    : "<option value=\"\">Crie um CNPJ primeiro</option>";
  const salesCompanySelect = document.getElementById("salesCompanySelect");
  if (salesCompanySelect) salesCompanySelect.innerHTML = options;
}

function renderSupervisorSelect() {
  const supervisors = (state.structure?.salesPeople || []).filter((person) => person.type === "supervisor");
  const supervisorSelect = document.getElementById("supervisorSelect");
  if (!supervisorSelect) return;
  supervisorSelect.innerHTML = [
    "<option value=\"\">Sem supervisor</option>",
    ...supervisors.map((person) => `<option value="${escapeHtml(person.id)}">${escapeHtml(person.name)}</option>`)
  ].join("");
}

function renderPermissionList() {
  const target = document.getElementById("permissionList");
  if (!target) return;
  if (!state.permissionCatalog.length) {
    target.innerHTML = empty("Catálogo de permissões não carregado.");
    return;
  }
  target.innerHTML = state.permissionCatalog.map((module) => `
    <fieldset class="permission-module">
      <legend>${escapeHtml(module.name)}</legend>
      ${(module.permissions || []).map((permission) => `
        <label>
          <input type="checkbox" name="permissions" value="${escapeHtml(permission)}">
          ${escapeHtml(permissionLabel(permission))}
        </label>
      `).join("")}
    </fieldset>
  `).join("");

  // Clique na legend seleciona/desmarca todos do módulo
  target.querySelectorAll("fieldset").forEach((fieldset) => {
    fieldset.querySelector("legend").style.cursor = "pointer";
    fieldset.querySelector("legend").title = "Clique para marcar/desmarcar todos";
    fieldset.querySelector("legend").addEventListener("click", () => {
      const boxes = fieldset.querySelectorAll("input[type=checkbox]");
      const allChecked = [...boxes].every((cb) => cb.checked);
      boxes.forEach((cb) => { cb.checked = !allChecked; });
    });
  });
}

function renderRoleSelect() {
  const select = document.getElementById("inviteRoleSelect");
  if (!select) return;
  const roles = state.structureRoles.filter((role) => role.tenantId);
  select.innerHTML = roles.length
    ? roles.map((role) => `<option value="${escapeHtml(role.id)}">${escapeHtml(role.name)}</option>`).join("")
    : "<option value=\"\">Crie um cargo primeiro</option>";
}

function renderStructureLists() {
  const groups = state.structure?.groups || [];
  const companies = state.structure?.companies || [];
  const salesPeople = state.structure?.salesPeople || [];
  const roles = state.structureRoles.filter((role) => role.tenantId);
  const groupNameById = new Map(groups.map((group) => [group.id, group.name]));
  const supervisorNameById = new Map(salesPeople.map((person) => [person.id, person.name]));

  document.getElementById("groupList").innerHTML = groups.length
    ? groups.map((group) => `
      <article class="mini-card">
        <strong>${escapeHtml(group.name)}</strong>
        <small>${escapeHtml(group.slug)} &middot; ${statusLabel(group.status)}</small>
      </article>
    `).join("")
    : empty("Nenhum grupo criado.");

  document.getElementById("companyList").innerHTML = companies.length
    ? companies.map((company) => `
      <article class="mini-card">
        <strong>${escapeHtml(company.tradeName || company.legalName)}</strong>
        <small>ERP ${escapeHtml(company.erpCompanyId)} &middot; ${escapeHtml(groupNameById.get(company.groupId) || "sem grupo")}</small>
        <small>${escapeHtml(company.document || "sem CNPJ")} ${escapeHtml(company.city || "")} ${escapeHtml(company.state || "")}</small>
      </article>
    `).join("")
    : empty("Nenhum CNPJ criado.");

  document.getElementById("salesPeopleList").innerHTML = salesPeople.length
    ? salesPeople.map((person) => `
      <article class="mini-card">
        <strong>${escapeHtml(person.name)}</strong>
        <small>${person.type === "supervisor" ? "Supervisor" : "Vendedor"} ${person.erpCode ? `&middot; ERP ${escapeHtml(person.erpCode)}` : ""}</small>
        <small>${person.supervisorId ? `Supervisor: ${escapeHtml(supervisorNameById.get(person.supervisorId) || person.supervisorId)}` : escapeHtml(person.email || "sem email")}</small>
      </article>
    `).join("")
    : empty("Nenhum vendedor ou supervisor criado.");

  document.getElementById("roleList").innerHTML = roles.length
    ? roles.map((role) => `
      <article class="mini-card">
        <strong>${escapeHtml(role.name)}</strong>
        <small>${roleTypeLabel(role.type)} &middot; ${(role.permissions || []).length} permissões</small>
      </article>
    `).join("")
    : empty("Nenhum cargo personalizado criado.");
}

async function createTenant(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  const result = document.getElementById("tenantFormResult");
  result.textContent = "Cadastrando cliente...";

  try {
    const tenant = await api("/api/support/tenants", {
      method: "POST",
      body: JSON.stringify(data)
    });
    result.textContent = `Cliente criado: ${tenant.slug}.crm.neurax.com.br`;
    form.reset();
    await loadAll();
  } catch (error) {
    result.textContent = error.message;
  }
}

async function createCompanyGroup(form) {
  const result = document.getElementById("groupFormResult");
  result.textContent = "Criando grupo...";
  try {
    await api(`/api/support/tenants/${encodeURIComponent(requireStructureTenant())}/groups`, {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(new FormData(form).entries()))
    });
    form.reset();
    result.textContent = "Grupo criado com sucesso.";
    await refreshStructureAndTenants();
  } catch (error) {
    result.textContent = error.message;
  }
}

async function createCompany(form) {
  const result = document.getElementById("companyFormResult");
  result.textContent = "Criando CNPJ...";
  try {
    await api(`/api/support/tenants/${encodeURIComponent(requireStructureTenant())}/companies`, {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(new FormData(form).entries()))
    });
    form.reset();
    result.textContent = "CNPJ criado com sucesso.";
    await refreshStructureAndTenants();
  } catch (error) {
    result.textContent = error.message;
  }
}

async function createSalesPerson(form) {
  const result = document.getElementById("salesPersonFormResult");
  const formData = new FormData(form);
  const data = Object.fromEntries(formData.entries());
  data.groupIds = formData.getAll("groupIds").filter(Boolean);
  data.companyIds = formData.getAll("companyIds").filter(Boolean);
  if (!data.supervisorId) delete data.supervisorId;
  result.textContent = "Salvando pessoa comercial...";
  try {
    await api(`/api/support/tenants/${encodeURIComponent(requireStructureTenant())}/sales-people`, {
      method: "POST",
      body: JSON.stringify(data)
    });
    form.reset();
    result.textContent = "Pessoa comercial salva com sucesso.";
    await refreshStructureAndTenants();
  } catch (error) {
    result.textContent = error.message;
  }
}

async function createRole(form) {
  const result = document.getElementById("roleFormResult");
  const data = Object.fromEntries(new FormData(form).entries());
  data.tenantId = requireStructureTenant();
  data.permissions = [...form.querySelectorAll("input[name='permissions']:checked")].map((input) => input.value);
  result.textContent = "Criando cargo...";
  try {
    await api("/api/roles", {
      method: "POST",
      body: JSON.stringify(data)
    });
    form.reset();
    result.textContent = "Cargo criado com sucesso.";
    await refreshStructureAndTenants();
  } catch (error) {
    result.textContent = error.message;
  }
}

async function createInvite(form) {
  const result = document.getElementById("inviteFormResult");
  const box = document.getElementById("inviteResultBox");
  const data = Object.fromEntries(new FormData(form).entries());
  data.tenantId = requireStructureTenant();
  result.textContent = "Gerando convite...";
  box.classList.add("hidden");
  try {
    const invite = await api("/api/users/invites", {
      method: "POST",
      body: JSON.stringify(data)
    });
    form.reset();
    result.textContent = "Convite gerado.";
    box.classList.remove("hidden");
    box.innerHTML = `
      <strong>Link de convite para teste</strong>
      <code>${escapeHtml(invite.url || "")}</code>
      <small>Em produção este link deve ser enviado por email e não exibido no painel.</small>
    `;
    await refreshStructureAndTenants();
  } catch (error) {
    result.textContent = error.message;
  }
}

async function refreshStructureAndTenants() {
  const tenants = await api("/api/support/tenants").catch(() => ({ data: state.tenants }));
  state.tenants = tenants.data || state.tenants;
  await loadStructureData();
  renderStructure();
  renderKpis();
  renderUsage();
}

function requireStructureTenant() {
  if (!state.structureTenantId) throw new Error("Selecione um cliente SaaS.");
  return state.structureTenantId;
}

async function handleTenantAction(action, tenantId) {
  if (action === "access") {
    await api("/api/support/active-tenant", {
      method: "PUT",
      body: JSON.stringify({ tenantId })
    });
    window.location.href = "/";
    return;
  }

  if (action === "config-erp") {
    await api("/api/support/active-tenant", {
      method: "PUT",
      body: JSON.stringify({ tenantId })
    });
    window.location.href = "/#erp-settings";
    return;
  }

  if (action === "config-whatsapp") {
    document.querySelectorAll(".master-sidebar nav a").forEach((item) => item.classList.remove("active"));
    document.querySelectorAll(".master-section").forEach((item) => item.classList.remove("active"));
    const waLink = document.querySelector(".master-sidebar nav a[href='#whatsapp']");
    if (waLink) waLink.classList.add("active");
    document.getElementById("whatsapp").classList.add("active");
    const select = document.getElementById("waTenantSelect");
    if (select) {
      select.value = tenantId;
      select.dispatchEvent(new Event("change"));
    }
    return;
  }

  if (action === "clear-crm") {
    const tenant = state.tenants.find((item) => item.id === tenantId);
    const name = tenant?.name || tenantId;
    const confirmed = window.confirm(`Tem certeza que deseja apagar TODOS os clientes, pedidos e orçamentos de "${name}"?\n\nEsta ação não pode ser desfeita. Use apenas para reimplantar do zero.`);
    if (!confirmed) return;
    try {
      const result = await api(`/api/support/tenants/${encodeURIComponent(tenantId)}/crm-data`, { method: "DELETE" });
      alert(`Dados apagados: ${result.deleted?.contacts || 0} clientes e ${result.deleted?.deals || 0} negócios removidos. O próximo sync recarregará tudo do ERP.`);
    } catch (error) {
      alert(`Erro ao limpar: ${error.message}`);
    }
    return;
  }

  if (action === "save-sync-config") {
    const dtIni = document.getElementById(`sync-dtini-${tenantId}`)?.value || "";
    const dtFim = document.getElementById(`sync-dtfim-${tenantId}`)?.value || "";
    const idEmpresaRaw = document.getElementById(`sync-idempresa-${tenantId}`)?.value || "";
    const idEmpresa = idEmpresaRaw ? Number(idEmpresaRaw) : undefined;
    const resultEl = document.getElementById(`sync-result-${tenantId}`);
    if (!dtIni || !dtFim) {
      if (resultEl) resultEl.textContent = "Preencha as duas datas.";
      return;
    }
    try {
      await api(`/api/support/tenants/${encodeURIComponent(tenantId)}/sync-config`, {
        method: "PUT",
        body: JSON.stringify({ dtIni, dtFim, ...(idEmpresa ? { idEmpresa } : {}) })
      });
      const empresaInfo = idEmpresa ? ` · empresa ${idEmpresa}` : "";
      if (resultEl) resultEl.textContent = `Salvo: ${formatDate(dtIni)} até ${formatDate(dtFim)}${empresaInfo}`;
    } catch (error) {
      if (resultEl) resultEl.textContent = error.message;
    }
    return;
  }

  if (action === "run-sync") {
    const resultEl = document.getElementById(`sync-result-${tenantId}`);
    if (resultEl) resultEl.textContent = "Sincronizando...";
    try {
      await api("/api/support/active-tenant", { method: "PUT", body: JSON.stringify({ tenantId }) });
      const stats = await api("/api/erp/sync/run", { method: "POST" });
      if (resultEl) resultEl.textContent = `Sincronizado: ${stats.upserted ?? stats.synced ?? 0} registros`;
    } catch (error) {
      if (resultEl) resultEl.textContent = error.message;
    }
    return;
  }

  const tenant = state.tenants.find((item) => item.id === tenantId);
  if (!tenant) return;

  const patchByAction = {
    activate: { status: "active", billingStatus: "active" },
    "set-implantacao": { status: "implantacao" },
    "set-producao": { status: "producao" },
    overdue: { billingStatus: "overdue" },
    block: { status: "blocked" },
    suspend: { billingStatus: "suspended" }
  };

  await api(`/api/support/tenants/${encodeURIComponent(tenantId)}`, {
    method: "PUT",
    body: JSON.stringify(patchByAction[action] || {})
  });
  await loadAll();
}

function filteredTenants() {
  if (!state.query) return state.tenants;
  return state.tenants.filter((tenant) => (
    `${tenant.name} ${tenant.slug} ${tenant.plan} ${tenant.status} ${tenant.billingStatus} ${tenant.billingEmail || ""} ${tenant.document || ""}`.toLowerCase().includes(state.query)
  ));
}

function countBy(items, getter) {
  return items.reduce((acc, item) => {
    const key = getter(item);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function hasPermission(permission) {
  return Boolean(state.user?.permissions?.includes(permission));
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    ...options
  });

  if (!response.ok) {
    let message = `Erro ${response.status}`;
    try {
      const body = await response.json();
      message = body.error || body.message || message;
    } catch {
      // Mantem erro padrao.
    }
    throw new Error(message);
  }

  return response.json();
}

function statusLabel(status) {
  return {
    active: "Ativo",
    trial: "Teste",
    paused: "Pausado",
    blocked: "Bloqueado",
    implantacao: "Implantação",
    producao: "Produção"
  }[status] || status || "Ativo";
}

function planLabel(plan) {
  return {
    starter: "Starter",
    business: "Business",
    enterprise: "Enterprise",
    internal: "Interno",
    "sem plano": "Sem plano"
  }[plan] || capitalize(plan || "Sem plano");
}

function roleTypeLabel(type) {
  return {
    admin: "Administrador",
    supervisor: "Supervisor",
    seller: "Vendedor",
    operator: "Operador",
    custom: "Personalizado"
  }[type] || capitalize(type || "Personalizado");
}

function permissionLabel(permission) {
  return {
    "dashboard:view": "Ver painel",
    "reports:view": "Ver relatórios",
    "contacts:view": "Ver clientes",
    "deals:view": "Ver negócios",
    "deals:write": "Alterar negócios",
    "goals:view": "Ver metas",
    "goals:write": "Alterar metas",
    "conversations:view": "Ver conversas",
    "conversations:write": "Responder conversas",
    "products:view": "Ver produtos",
    "products:write": "Alterar produtos",
    "users:view": "Ver usuários",
    "users:write": "Alterar usuários e cargos",
    "settings:manage": "Configurar integrações",
    "integrations:view": "Ver integrações",
    "integrations:manage": "Gerenciar integrações"
  }[permission] || permission;
}

function billingLabel(status) {
  return {
    active: "Em dia",
    trial: "Teste",
    overdue: "Em atraso",
    suspended: "Suspenso",
    canceled: "Cancelado"
  }[status] || status || "Em dia";
}

function eventStatusLabel(status) {
  return {
    success: "Sucesso",
    ok: "Sucesso",
    failed: "Falhou",
    error: "Erro",
    skipped: "Ignorado",
    pending: "Pendente"
  }[status] || status || "Info";
}

function statusClass(status) {
  if (status === "blocked") return "danger";
  if (status === "paused") return "warn";
  if (status === "implantacao") return "info";
  if (status === "producao") return "success";
  return "";
}

function billingClass(status) {
  return ["overdue", "suspended", "canceled"].includes(status) ? "danger" : "";
}

function formatDate(value) {
  if (!value) return "";
  const iso = String(value).trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const [, year, month, day] = iso;
    return `${day.padStart(2, "0")}/${month.padStart(2, "0")}/${year}`;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatDateTime(value) {
  if (!value) return "";
  const iso = String(value).trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{2}):(\d{2}))?/);
  if (iso) {
    const [, year, month, day, hour, minute] = iso;
    const datePart = `${day.padStart(2, "0")}/${month.padStart(2, "0")}/${year}`;
    return hour ? `${datePart} ${hour}:${minute}` : datePart;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function empty(message) {
  return `<div class="empty-state"><strong>${escapeHtml(message)}</strong><span>Assim que houver dados, eles aparecem aqui.</span></div>`;
}

function capitalize(value) {
  const text = String(value || "");
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ── WhatsApp config por tenant ──────────────────────────────────────────
function renderWaTenantSelect() {
  const select = document.getElementById("waTenantSelect");
  if (!select) return;
  select.innerHTML = state.tenants.length
    ? state.tenants.map((t) => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.name)} (${escapeHtml(t.slug)})</option>`).join("")
    : "<option value=\"\">Nenhum cliente cadastrado</option>";
}

(function initWaConfig() {
  const loadBtn = document.getElementById("waConfigLoadBtn");
  const saveBtn = document.getElementById("waConfigSaveBtn");
  const resultEl = document.getElementById("waConfigResult");

  async function loadConfig() {
    const tenantId = document.getElementById("waTenantSelect")?.value;
    if (!tenantId) { if (resultEl) resultEl.textContent = "Selecione um cliente."; return; }
    if (resultEl) resultEl.textContent = "Carregando...";
    try {
      const data = await api(`/api/support/tenants/${encodeURIComponent(tenantId)}/whatsapp-config`);
      document.getElementById("waWabaId").value = data.wabaId || "";
      document.getElementById("waPhoneNumberId").value = data.phoneNumberId || "";
      document.getElementById("waAccessToken").value = data.accessToken || "";
      document.getElementById("waDefaultVars").value = JSON.stringify(data.defaultVariables || {}, null, 2);
      if (resultEl) resultEl.textContent = "Configuração carregada.";
    } catch (error) {
      if (resultEl) resultEl.textContent = `Erro: ${error.message}`;
    }
  }

  async function saveConfig() {
    const tenantId = document.getElementById("waTenantSelect")?.value;
    if (!tenantId) { if (resultEl) resultEl.textContent = "Selecione um cliente."; return; }
    let defaultVariables = {};
    try {
      defaultVariables = JSON.parse(document.getElementById("waDefaultVars").value || "{}");
    } catch {
      if (resultEl) resultEl.textContent = "JSON das variáveis padrão é inválido.";
      return;
    }
    if (resultEl) resultEl.textContent = "Salvando...";
    try {
      await api(`/api/support/tenants/${encodeURIComponent(tenantId)}/whatsapp-config`, {
        method: "PUT",
        body: JSON.stringify({
          wabaId: document.getElementById("waWabaId").value.trim(),
          phoneNumberId: document.getElementById("waPhoneNumberId").value.trim(),
          accessToken: document.getElementById("waAccessToken").value.trim(),
          defaultVariables
        })
      });
      if (resultEl) resultEl.textContent = "Configuração salva com sucesso.";
    } catch (error) {
      if (resultEl) resultEl.textContent = `Erro: ${error.message}`;
    }
  }

  async function seedFromEnv() {
    const tenantId = document.getElementById("waTenantSelect")?.value;
    if (!tenantId) { if (resultEl) resultEl.textContent = "Selecione um cliente."; return; }
    if (resultEl) resultEl.textContent = "Importando credenciais do .env...";
    try {
      const data = await api(`/api/support/tenants/${encodeURIComponent(tenantId)}/whatsapp-config/seed-from-env`, { method: "POST" });
      document.getElementById("waWabaId").value = data.wabaId || "";
      document.getElementById("waPhoneNumberId").value = data.phoneNumberId || "";
      document.getElementById("waAccessToken").value = data.accessToken || "";
      document.getElementById("waDefaultVars").value = JSON.stringify(data.defaultVariables || {}, null, 2);
      if (resultEl) resultEl.textContent = "Credenciais do .env importadas e salvas para este cliente.";
    } catch (error) {
      if (resultEl) resultEl.textContent = `Erro: ${error.message}`;
    }
  }

  loadBtn?.addEventListener("click", loadConfig);
  document.getElementById("waConfigSeedBtn")?.addEventListener("click", seedFromEnv);
  saveBtn?.addEventListener("click", saveConfig);
  document.getElementById("waTenantSelect")?.addEventListener("change", loadConfig);
})();

// ── WhatsApp teste ──────────────────────────────────────────────────────
(function initWhatsApp() {
  const statusEl = document.getElementById("whatsappStatus");
  const sendBtn = document.getElementById("waSendBtn");
  const resultEl = document.getElementById("waResult");

  fetch("/readyz").then(r => r.json()).then((data) => {
    if (!statusEl) return;
    if (data.metaConfigured) {
      statusEl.textContent = "API configurada";
      statusEl.className = "status success";
    } else {
      statusEl.textContent = "Não configurada";
      statusEl.className = "status warn";
    }
  }).catch(() => {});

  sendBtn?.addEventListener("click", async () => {
    const to = document.getElementById("waTo").value.trim();
    const text = document.getElementById("waText").value.trim();
    if (!to) { resultEl.textContent = "Informe o número de destino."; return; }
    if (!text) { resultEl.textContent = "Informe a mensagem."; return; }
    sendBtn.disabled = true;
    sendBtn.textContent = "Enviando...";
    resultEl.textContent = "";
    try {
      const res = await api("/api/whatsapp/test", {
        method: "POST",
        body: JSON.stringify({ to, text })
      });
      resultEl.textContent = res.ok ? "✓ Mensagem enviada com sucesso!" : `Erro: ${res.error || "desconhecido"}`;
    } catch (err) {
      resultEl.textContent = `Erro: ${err.message}`;
    } finally {
      sendBtn.disabled = false;
      sendBtn.textContent = "Enviar mensagem";
    }
  });
})();

loadAll().catch((error) => {
  console.error(error);
  if (String(error.message).includes("unauthorized") || String(error.message).includes("401")) {
    window.location.href = "/login.html?next=/master.html";
  }
});
