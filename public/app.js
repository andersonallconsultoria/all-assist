const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL"
});

const state = {
  currentUser: null,
  context: null,
  dashboard: null,
  deals: [],
  pipelines: [],
  selectedPipelineId: "",
  pipelineFormMode: "create",
  contacts: [],
  conversations: [],
  users: [],
  roles: [],
  products: [],
  erpIntegration: null,
  integrationSchedules: [],
  support: null,
  ordersFilter: "all",
  contactsFilter: "all",
  usersFilter: "all",
  productsFilter: "all",
  waTemplates: [],
  waSettings: null
};

const STAGE_ORDER = [
  "Entrada",
  "Aguardando contato",
  "Em negociacao",
  "Venda efetivada",
  "Gerou documento fiscal",
  "Pedido negado"
];

const CHART_COLORS = ["#00bc8f", "#0891b2", "#0ea5e9", "#d99700", "#dc3d6a", "#7c3aed"];
const MONTH_LABELS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const compactMoney = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1
});

const FIELD_LABELS = {
  id: "Codigo",
  companyId: "Codigo da empresa",
  tenantId: "Empresa da plataforma",
  createdAt: "Criado em",
  updatedAt: "Atualizado em",
  deletedAt: "Excluido em",
  lastSeenAt: "Ultima sincronizacao",
  lastSyncedAt: "Ultima sincronizacao",
  source: "Origem",
  name: "Nome",
  phone: "Telefone",
  number: "Telefone",
  email: "Email",
  city: "Cidade",
  state: "Estado",
  document: "Documento",
  externalCustomerId: "Codigo do cliente no ERP",
  pedido: "Pedido",
  empresa: "Empresa",
  cliente: "Cliente",
  telefone: "Telefone",
  valor: "Valor",
  etapa: "Etapa",
  status: "Status",
  vendedor: "Vendedor",
  usuarioErp: "Usuario ERP",
  dataMovimento: "Data do movimento",
  validade: "Validade",
  ultimaSincronizacao: "Ultima sincronizacao",
  idempresa: "Codigo da empresa",
  idorcamento: "Numero do orcamento",
  dtmovimento: "Data do movimento",
  valtotliquido: "Valor liquido",
  idclifor: "Codigo do cliente",
  descrcidade: "Cidade",
  uf: "Estado",
  idcep: "CEP",
  endereco: "Endereco",
  bairro: "Bairro",
  inscrestadual: "Inscricao estadual",
  cnpjcpf: "CNPJ/CPF",
  fone1: "Telefone principal",
  fonecelular: "Celular",
  flagaprovado: "Aprovado",
  numero: "Numero",
  complemento: "Complemento",
  dtvalidade: "Data de validade",
  valorc: "Tipo de valor",
  desrdav: "Tipo do documento",
  idconsolidacao: "Codigo da consolidacao",
  flagprenota: "Pre-nota",
  flagimportado: "Importado",
  flagprenotapaga: "Pre-nota paga",
  flagpedidodenegado: "Pedido negado",
  usuario: "Usuario ERP",
  idregiao: "Codigo da regiao",
  dtagendacontato: "Data agenda contato",
  idsituacaogestao: "Codigo situacao gestao",
  statusgestao: "Status gestao",
  vendedores: "Vendedores",
  idEmpresa: "Codigo da empresa",
  numeroOrcamento: "Numero do orcamento",
  valorPedido: "Valor do pedido",
  dataMovimento: "Data do movimento",
  dataValidade: "Data de validade",
  statusPedido: "Status do pedido",
  statusGestao: "Status gestao",
  tipoDocumento: "Tipo do documento",
  vendedorErp: "Vendedor ERP",
  usuarioERP: "Usuario ERP",
  usuarioCiss: "Usuario ERP",
  vendedorCiss: "Vendedor ERP",
  created: "Negócio criado",
  stage_changed: "Etapa alterada",
  erp_updated: "Atualizado pelo ERP",
  expired: "Orçamento vencido",
  quote_converted: "Orçamento efetivado",
  note: "Anotação"
};

applySavedTheme();

document.querySelectorAll("nav a").forEach((link) => {
  link.addEventListener("click", () => {
    document.querySelectorAll("nav a").forEach((item) => item.classList.remove("active"));
    document.querySelectorAll(".view").forEach((item) => item.classList.remove("active"));
    link.classList.add("active");
    document.querySelector(link.getAttribute("href")).classList.add("active");
    document.getElementById("pageTitle").textContent = link.textContent.trim();
    if (link.getAttribute("href") === "#sellers") renderSellers();
    if (link.getAttribute("href") === "#whatsapp-chat") renderWhatsAppChat();
  });
});

document.getElementById("syncButton").addEventListener("click", async () => {
  setStatus("Sincronizando ERP...");
  try {
    const stats = await api("/api/erp/sync/run", { method: "POST" });
    setStatus(`Sincronizacao concluida: ${stats.upserted || 0} atualizados, ${stats.skipped || 0} sem alteracao, ${stats.failed || 0} erros`);
    await loadAll();
    setTimeout(() => setStatus("Online"), 6000);
  } catch (error) {
    setStatus(`Erro na sincronizacao: ${error.message}`);
    setTimeout(() => setStatus("Online"), 8000);
  }
});

document.getElementById("logoutButton").addEventListener("click", async () => {
  await api("/api/auth/logout", { method: "POST" });
  window.location.href = "/login.html";
});

document.querySelector(".menu-button")?.addEventListener("click", () => {
  document.querySelector(".sidebar")?.classList.toggle("sidebar-open");
});

document.getElementById("notifButton")?.addEventListener("click", () => {
  setStatus("Sem notificacoes pendentes");
  setTimeout(() => setStatus("Online"), 2500);
});

document.getElementById("erpSettingsForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveErpSettings(event.currentTarget);
});

document.getElementById("erpTestButton").addEventListener("click", async () => {
  await testErpSettings(document.getElementById("erpSettingsForm"));
});

document.getElementById("erpClearButton").addEventListener("click", async () => {
  await clearErpSettings(document.getElementById("erpSettingsForm"));
});

document.getElementById("dealSearch").addEventListener("input", () => {
  renderDeals();
});

document.getElementById("pipelineSelect").addEventListener("change", (event) => {
  state.selectedPipelineId = event.target.value;
  hidePipelineForm();
  renderDeals();
});

document.getElementById("newPipelineButton").addEventListener("click", () => {
  showPipelineForm("create");
});

document.getElementById("editStagesButton").addEventListener("click", () => {
  showPipelineForm("edit");
});

document.getElementById("cancelPipelineButton").addEventListener("click", hidePipelineForm);
document.getElementById("pipelineDrawerClose").addEventListener("click", hidePipelineForm);
document.getElementById("pipelineOverlay").addEventListener("click", (event) => {
  if (event.target.id === "pipelineOverlay") hidePipelineForm();
});

document.getElementById("pipelineForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  await savePipeline(event.currentTarget);
});

document.getElementById("themeToggle").addEventListener("click", () => {
  const nextTheme = document.body.dataset.theme === "dark" ? "light" : "dark";
  setTheme(nextTheme);
});

document.querySelectorAll("#dashboard .segmented-control button").forEach((btn) => {
  btn.addEventListener("click", () => {
    const control = btn.closest(".segmented-control");
    control.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const isCount = btn.textContent.trim().toLowerCase().includes("quantidade");
    const model = buildDashboardModel();
    document.getElementById("pipelineChart").innerHTML = renderPipelineArea(model.monthly, isCount);
  });
});

document.getElementById("rptSegControl")?.querySelectorAll("button").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.getElementById("rptSegControl").querySelectorAll("button").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const isCount = btn.textContent.trim().toLowerCase().includes("quantidade");
    const model = buildDashboardModel();
    document.getElementById("rptChart").innerHTML = renderPipelineArea(model.monthly, isCount);
  });
});

document.getElementById("ordersSearch")?.addEventListener("input", renderOrdersTable);
document.getElementById("quotesSearch")?.addEventListener("input", renderQuotesTable);

document.querySelectorAll(".commercial-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".commercial-tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    const isQuotes = tab.dataset.commercialTab === "quotes";
    document.getElementById("commercialQuotes").style.display = isQuotes ? "" : "none";
    document.getElementById("commercialOrders").style.display = isQuotes ? "none" : "";
    if (isQuotes) renderQuotesTable(); else renderOrdersTable();
  });
});
document.getElementById("contactSearch")?.addEventListener("input", renderContactsTable);
document.getElementById("productsSearch")?.addEventListener("input", renderProducts);
document.getElementById("convSearch")?.addEventListener("input", renderConversations);
document.querySelectorAll(".conv-filter-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    convFilter = btn.dataset.filter;
    document.querySelectorAll(".conv-filter-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    renderConversations();
  });
});
document.querySelectorAll(".conv-provider-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    convProviderFilter = btn.dataset.provider;
    document.querySelectorAll(".conv-provider-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    renderConversations();
  });
});

setupFilterTabs("ordersFilterTabs", (f) => { state.ordersFilter = f; renderOrdersTable(); });
setupFilterTabs("quotesFilterTabs", (f) => { state.quotesFilter = f; renderQuotesTable(); });
setupFilterTabs("contactsFilterTabs", (f) => { state.contactsFilter = f; renderContactsTable(); });
setupFilterTabs("usersFilterTabs", (f) => { state.usersFilter = f; renderUsersTable(); });
setupFilterTabs("productsFilterTabs", (f) => { state.productsFilter = f; renderProducts(); });

document.getElementById("inviteUserBtn")?.addEventListener("click", () => {
  openInviteModal();
});

document.getElementById("inviteDrawerClose")?.addEventListener("click", closeInviteModal);
document.getElementById("cancelInviteButton")?.addEventListener("click", closeInviteModal);
document.getElementById("inviteOverlay")?.addEventListener("click", (event) => {
  if (event.target.id === "inviteOverlay") closeInviteModal();
});

document.getElementById("inviteUserForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  await submitInvite(event.currentTarget);
});

document.getElementById("newAutomationBtn")?.addEventListener("click", () => {
  setStatus("Modulo de automacoes em desenvolvimento — disponivel em breve");
  setTimeout(() => setStatus("Online"), 3500);
});

document.getElementById("newTemplateBtn")?.addEventListener("click", () => {
  setStatus("Templates de mensagem — disponivel em breve");
  setTimeout(() => setStatus("Online"), 3500);
});

document.getElementById("waTemplatesRefresh")?.addEventListener("click", loadWaTemplates);

document.getElementById("waSettingsForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveWaSettings(event.currentTarget);
});

document.getElementById("waModalClose")?.addEventListener("click", closeWaModal);
document.getElementById("cancelWaModal")?.addEventListener("click", closeWaModal);
document.getElementById("waModalOverlay")?.addEventListener("click", (event) => {
  if (event.target.id === "waModalOverlay") closeWaModal();
});

document.getElementById("waModalForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const errorEl = document.getElementById("waModalError");
  const sendBtn = document.getElementById("waModalSend");
  errorEl.style.display = "none";
  sendBtn.disabled = true;
  sendBtn.textContent = "Enviando...";
  try {
    const to = document.getElementById("waModalTo").value.trim();
    const templateName = document.getElementById("waModalTemplate").value;
    const language = document.getElementById("waModalLanguage").value.trim() || "pt_BR";
    const overlay = document.getElementById("waModalOverlay");
    const deal = state.deals.find((d) => d.id === overlay.dataset.dealId) || {};
    const vars = buildWaVariables(deal);
    const template = state.waTemplates.find((t) => t.name === templateName);
    const components = buildTemplateComponents(template, vars);
    await api("/api/whatsapp/send-template", {
      method: "POST",
      body: JSON.stringify({ to, templateName, language, components })
    });
    closeWaModal();
    setStatus("Mensagem WhatsApp enviada com sucesso");
    setTimeout(() => setStatus("Online"), 4000);
  } catch (error) {
    errorEl.textContent = error.message;
    errorEl.style.display = "";
  } finally {
    sendBtn.disabled = false;
    sendBtn.textContent = "Enviar";
  }
});

document.querySelectorAll(".settings-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".settings-tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    renderSettingsContent(tab.dataset.tab);
  });
});

document.getElementById("dealDrawerClose").addEventListener("click", closeDealDrawer);
document.getElementById("dealOverlay").addEventListener("click", (event) => {
  if (event.target.id === "dealOverlay") closeDealDrawer();
});

document.getElementById("tenantForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  await createTenant(event.currentTarget);
});

function setupFilterTabs(containerId, onChange) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.querySelectorAll(".filter-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      container.querySelectorAll(".filter-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      onChange(tab.dataset.filter);
    });
  });
}

function renderReports() {
  const model = buildDashboardModel();
  const el = (id) => document.getElementById(id);
  if (!el("rptTotalDeals")) return;

  el("rptTotalDeals").textContent = model.deals.length;
  el("rptTotalDealsChg").innerHTML = renderTrendBadge(model.pipelineChange, "variacao");
  el("rptTotalValue").textContent = compactMoney.format(model.totalPipeline);
  el("rptTotalValueChg").innerHTML = renderTrendBadge(model.pipelineChange, "variacao no periodo");
  el("rptWinRate").textContent = `${model.winRate.toFixed(1)}%`;
  el("rptWinRateChg").textContent = `${model.wonDeals.length} de ${model.deals.length} negocios`;
  el("rptAvgDeal").textContent = compactMoney.format(model.avgDealSize);
  el("rptAvgDealChg").textContent = `${model.deals.length} negocios analisados`;

  el("rptSpark1").innerHTML = renderSparkline(model.monthly.countValues, CHART_COLORS[0]);
  el("rptSpark2").innerHTML = renderSparkline(model.monthly.values, CHART_COLORS[1]);
  el("rptSpark3").innerHTML = renderSparkline(model.monthly.wonValues, CHART_COLORS[2]);
  el("rptSpark4").innerHTML = renderSparkline(model.monthly.avgValues, CHART_COLORS[3]);

  el("rptChart").innerHTML = renderPipelineArea(model.monthly, false);
  el("rptDonut").innerHTML = renderStageDonut(model.stageRows);
  el("rptLegend").innerHTML = renderStageLegend(model.stageRows);
  el("rptSellers").innerHTML = renderTopSalesReps(model.sellerRows);
  el("rptLeadSources").innerHTML = renderLeadSources(model.leadSources);
}

function renderCommercialTable({ targetId, filterTabsId, searchId, filter, emptyMsg, colLabel, deals, filterKey }) {
  const target = document.getElementById(targetId);
  if (!target) return;
  const q = normalizeText(document.getElementById(searchId)?.value || "");

  const isExpired = (d) => normalizeText(d.stage || "") === "vencidos";
  const isLost = (d) => normalizeText(d.stage || "").includes("negado") || normalizeText(d.status || "").includes("negado");

  const base = deals;
  const filtered = base.filter((deal) => {
    const search = normalizeText(`${deal.title} ${deal.contactName} ${deal.contactPhone} ${deal.externalOrderId} ${deal.assignedSeller}`);
    if (q && !search.includes(q)) return false;
    if (filter === "won") return isWonDeal(deal);
    if (filter === "lost") return isLost(deal);
    if (filter === "expired") return isExpired(deal);
    if (filter === "open") return !isWonDeal(deal) && !isLost(deal) && !isExpired(deal);
    return true;
  });

  const counts = {
    all: base.length,
    won: base.filter(isWonDeal).length,
    lost: base.filter(isLost).length,
    expired: base.filter(isExpired).length,
    open: base.filter((d) => !isWonDeal(d) && !isLost(d) && !isExpired(d)).length
  };
  updateFilterTabCounts(filterTabsId, counts);

  if (!filtered.length) {
    target.innerHTML = `<div class="empty-state">${emptyMsg}</div>`;
    return;
  }

  target.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>${colLabel}</th>
          <th>Cliente</th>
          <th>Etapa</th>
          <th>Data</th>
          <th>Validade</th>
          <th>Valor</th>
          <th>Vendedor</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${filtered.map((deal) => `
          <tr data-deal-id="${escapeHtml(deal.id)}">
            <td><span style="font-family:monospace;font-size:12px;color:var(--muted)">#${escapeHtml(deal.externalOrderId || deal.id.slice(0,8))}</span></td>
            <td>
              <div class="table-name-cell">
                <span class="table-avatar">${escapeHtml(initials(deal.contactName || "?"))}</span>
                <div>
                  <strong>${escapeHtml(deal.contactName || "Sem nome")}</strong>
                  <small>${escapeHtml(deal.contactPhone || "")}</small>
                </div>
              </div>
            </td>
            <td><span class="stage-pill ${escapeHtml(stagePillClass(deal.stage))}">${escapeHtml(deal.stage || "Entrada")}</span></td>
            <td class="cell-muted">${escapeHtml(formatShortDate(deal.movementDate || deal.updatedAt))}</td>
            <td class="cell-muted">${escapeHtml(formatBrazilianDate(deal.validUntil) || "—")}</td>
            <td><strong>${money.format(dealAmount(deal))}</strong></td>
            <td class="cell-muted">${escapeHtml(deal.assignedSeller || "—")}</td>
            <td><button class="row-action-btn" type="button">Ver detalhes</button></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
    <div class="table-footer">
      <small>Exibindo ${filtered.length} de ${base.length} ${filterKey}</small>
    </div>
  `;

  target.querySelectorAll("tr[data-deal-id]").forEach((row) => {
    row.addEventListener("click", () => openDealDetail(row.dataset.dealId));
  });
}

function renderOrdersTable() {
  const orders = state.deals.filter((d) => getDealKind(d) === "order");
  renderCommercialTable({
    targetId: "ordersTableContent",
    filterTabsId: "ordersFilterTabs",
    searchId: "ordersSearch",
    filter: state.ordersFilter || "all",
    emptyMsg: "Nenhum pedido encontrado.",
    colLabel: "Pedido",
    deals: orders,
    filterKey: "pedidos"
  });
}

function renderQuotesTable() {
  const quotes = state.deals.filter((d) => getDealKind(d) === "quote");
  renderCommercialTable({
    targetId: "quotesTableContent",
    filterTabsId: "quotesFilterTabs",
    searchId: "quotesSearch",
    filter: state.quotesFilter || "all",
    emptyMsg: "Nenhum orçamento encontrado.",
    colLabel: "Orçamento",
    deals: quotes,
    filterKey: "orçamentos"
  });
}

function renderContactsTable() {
  const target = document.getElementById("contactTableContent");
  if (!target) return;
  const q = normalizeText(document.getElementById("contactSearch")?.value || "");
  const filter = state.contactsFilter;

  const dealCountByContact = new Map();
  for (const deal of state.deals) {
    if (deal.contactPhone) {
      dealCountByContact.set(deal.contactPhone, (dealCountByContact.get(deal.contactPhone) || 0) + 1);
    }
  }

  const filtered = state.contacts.filter((c) => {
    const search = normalizeText(`${c.name} ${c.phone} ${c.city} ${c.state} ${c.email}`);
    if (q && !search.includes(q)) return false;
    const deals = dealCountByContact.get(c.phone) || 0;
    if (filter === "withdeals") return deals > 0;
    if (filter === "withphone") return Boolean(c.phone);
    return true;
  });

  updateFilterTabCounts("contactsFilterTabs", {
    all: state.contacts.length,
    withdeals: state.contacts.filter((c) => (dealCountByContact.get(c.phone) || 0) > 0).length,
    withphone: state.contacts.filter((c) => Boolean(c.phone)).length
  });

  if (!filtered.length) {
    target.innerHTML = `<div class="empty-state">Nenhum cliente encontrado.</div>`;
    return;
  }

  const avatarClasses = ["", "avatar-cyan", "avatar-amber", "avatar-rose", "avatar-purple"];

  target.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Cliente</th>
          <th>Telefone</th>
          <th>Cidade / UF</th>
          <th>Negocios</th>
          <th>Origem</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${filtered.map((contact, i) => {
          const dealCount = dealCountByContact.get(contact.phone) || 0;
          const cls = avatarClasses[i % avatarClasses.length];
          return `
            <tr>
              <td>
                <div class="table-name-cell">
                  <span class="table-avatar ${cls}">${escapeHtml(initials(contact.name))}</span>
                  <div>
                    <strong>${escapeHtml(contact.name)}</strong>
                    <small>${escapeHtml(contact.email || "")}</small>
                  </div>
                </div>
              </td>
              <td class="cell-muted">${escapeHtml(contact.phone || "—")}</td>
              <td class="cell-muted">${escapeHtml([contact.city, contact.state].filter(Boolean).join(" / ") || "—")}</td>
              <td>
                ${dealCount > 0
                  ? `<span class="badge badge-success">${dealCount} negocio${dealCount > 1 ? "s" : ""}</span>`
                  : `<span class="badge badge-neutral">Sem negocios</span>`}
              </td>
              <td class="cell-muted">${escapeHtml(sourceLabel(contact.source || "manual"))}</td>
              <td style="display:flex;gap:6px;align-items:center">
                <button class="btn btn-sm contact-edit-btn"
                  data-contact-id="${escapeHtml(contact.id)}">Editar</button>
                ${contact.phone
                  ? `<button class="btn btn-sm" data-contact-phone="${escapeHtml(contact.phone)}" data-contact-name="${escapeHtml(contact.name)}" onclick="openContactConversations(this)">Conversas</button>`
                  : ""}
              </td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
    <div class="table-footer">
      <small>Exibindo ${filtered.length} de ${state.contacts.length} clientes</small>
    </div>
  `;
}

function renderUsersTable() {
  const target = document.getElementById("userTableContent");
  if (!target) return;
  const filter = state.usersFilter;

  const filtered = state.users.filter((u) => {
    if (filter === "active") return u.status === "active";
    if (filter === "inactive") return u.status !== "active";
    return true;
  });

  updateFilterTabCounts("usersFilterTabs", {
    all: state.users.length,
    active: state.users.filter((u) => u.status === "active").length,
    inactive: state.users.filter((u) => u.status !== "active").length
  });

  document.getElementById("roleList").innerHTML = state.roles.length
    ? state.roles.map((role) => `
        <div class="summary-item">
          <span>${escapeHtml(role.name)}</span>
          <strong>${role.permissions?.length || 0}</strong>
        </div>
      `).join("")
    : `<div class="empty-state">Nenhum perfil encontrado.</div>`;

  if (!filtered.length) {
    target.innerHTML = `<div class="empty-state">Nenhum usuario encontrado.</div>`;
    return;
  }

  target.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Usuario</th>
          <th>Cargo</th>
          <th>Status</th>
          <th>Tipo</th>
        </tr>
      </thead>
      <tbody>
        ${filtered.map((user, i) => {
          const avatarClasses = ["", "avatar-cyan", "avatar-amber", "avatar-rose", "avatar-purple"];
          const cls = avatarClasses[i % avatarClasses.length];
          const isActive = user.status === "active";
          return `
            <tr>
              <td>
                <div class="table-name-cell">
                  <span class="table-avatar ${cls}">${escapeHtml(initials(user.name))}</span>
                  <div>
                    <strong>${escapeHtml(user.name)}</strong>
                    <small>${escapeHtml(user.email)}</small>
                  </div>
                </div>
              </td>
              <td class="cell-muted">${escapeHtml(user.role?.name || "Sem cargo")}</td>
              <td>
                <span class="badge ${isActive ? "badge-success" : "badge-neutral"}">
                  ${isActive ? "Ativo" : escapeHtml(statusLabel(user.status))}
                </span>
              </td>
              <td>
                <span class="badge ${user.isMaster ? "badge-warning" : "badge-info"}">
                  ${user.isMaster ? "Master" : "Usuario"}
                </span>
              </td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
    <div class="table-footer">
      <small>Exibindo ${filtered.length} de ${state.users.length} usuarios</small>
    </div>
  `;
}

function renderProducts() {
  const target = document.getElementById("productsTableContent");
  if (!target) return;
  const q = normalizeText(document.getElementById("productsSearch")?.value || "");
  const filter = state.productsFilter;

  const filtered = state.products.filter((p) => {
    const search = normalizeText(`${p.name} ${p.code} ${p.category}`);
    if (q && !search.includes(q)) return false;
    if (filter === "active") return p.status === "active" || p.active;
    return true;
  });

  if (!state.products.length) {
    target.innerHTML = `
      <div class="empty-state" style="padding:60px 40px">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--line)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin:0 auto 16px;display:block"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg>
        <strong style="display:block;font-size:16px;margin-bottom:8px">Nenhum produto sincronizado</strong>
        <p style="color:var(--muted);font-size:14px;max-width:380px;margin:0 auto">Os produtos aparecao aqui apos a sincronizacao com o ERP CISS. Ative a agenda de Produtos na tela de Integracao ERP.</p>
      </div>
    `;
    return;
  }

  target.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Produto</th>
          <th>Categoria</th>
          <th>Status</th>
          <th>Estoque</th>
          <th>Preco</th>
          <th>Atualizado</th>
        </tr>
      </thead>
      <tbody>
        ${filtered.map((product) => `
          <tr>
            <td>
              <div class="table-name-cell">
                <span class="product-icon">📦</span>
                <div>
                  <strong>${escapeHtml(product.name || product.code)}</strong>
                  <small>${escapeHtml(product.code || "")}</small>
                </div>
              </div>
            </td>
            <td class="cell-muted">${escapeHtml(product.category || "—")}</td>
            <td>
              <span class="badge ${product.active || product.status === "active" ? "badge-success" : "badge-neutral"}">
                ${product.active || product.status === "active" ? "Ativo" : "Inativo"}
              </span>
            </td>
            <td class="cell-muted">${product.stock ?? "—"}</td>
            <td><strong>${product.price ? money.format(Number(product.price)) : "—"}</strong></td>
            <td class="cell-muted">${escapeHtml(formatShortDate(product.updatedAt || product.createdAt))}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
    <div class="table-footer">
      <small>Exibindo ${filtered.length} de ${state.products.length} produtos</small>
    </div>
  `;
}

function renderSettings() {
  renderSettingsContent("profile");
}

function renderSettingsContent(tab) {
  const target = document.getElementById("settingsContent");
  if (!target) return;
  const user = state.currentUser;
  if (!user) return;

  if (tab === "profile") {
    target.innerHTML = `
      <div class="settings-section">
        <h3>Perfil</h3>
        <p>Informacoes da sua conta no ALL Assist.</p>
        <div style="display:flex;align-items:center;gap:18px;margin-bottom:24px">
          <span class="user-avatar-lg">${escapeHtml(initials(user.name))}</span>
          <div>
            <strong style="font-size:18px">${escapeHtml(user.name)}</strong>
            <p style="color:var(--muted);margin:4px 0 0;font-size:14px">${escapeHtml(user.email)}</p>
          </div>
        </div>
        <div class="settings-row">
          <div class="settings-row-label"><strong>Nome completo</strong><small>Seu nome de exibicao</small></div>
          <span style="color:var(--muted)">${escapeHtml(user.name)}</span>
        </div>
        <div class="settings-row">
          <div class="settings-row-label"><strong>Email</strong><small>Usado para login</small></div>
          <span style="color:var(--muted)">${escapeHtml(user.email)}</span>
        </div>
        <div class="settings-row">
          <div class="settings-row-label"><strong>Cargo</strong><small>Perfil de acesso</small></div>
          <span class="badge badge-info">${escapeHtml(user.role?.name || (user.isMaster ? "Master" : "Usuario"))}</span>
        </div>
        <div class="settings-row">
          <div class="settings-row-label"><strong>Empresa ativa</strong><small>Tenant atual</small></div>
          <span style="color:var(--muted)">${escapeHtml(state.context?.tenant?.name || "—")}</span>
        </div>
      </div>
    `;
  } else if (tab === "deals") {
    const tenant = state.context?.tenant || {};
    const warningDays = tenant.expiryWarningDays ?? 2;
    target.innerHTML = `
      <div class="settings-section">
        <h3>Negócios</h3>
        <p>Configurações de vencimento e alertas de orçamentos e pedidos.</p>
        <div class="settings-row">
          <div class="settings-row-label">
            <strong>Aviso de vencimento</strong>
            <small>Quantos dias antes do vencimento exibir alerta no card</small>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <input type="number" id="expiryWarningDaysInput" min="0" max="30" value="${Number(warningDays)}"
              style="width:70px;padding:6px 10px;border-radius:8px;border:1px solid var(--line);background:var(--panel);color:var(--ink);font-size:14px;text-align:center">
            <span style="color:var(--muted);font-size:13px">dias</span>
            <button class="btn-primary" type="button" id="saveExpiryWarningDays" style="padding:6px 14px;font-size:13px">Salvar</button>
          </div>
        </div>
        <p id="expiryWarningSaved" style="color:var(--accent);font-size:13px;display:none">Salvo com sucesso!</p>
      </div>
    `;
    document.getElementById("saveExpiryWarningDays")?.addEventListener("click", async () => {
      const days = Number(document.getElementById("expiryWarningDaysInput").value);
      await api("/api/tenant/settings", { method: "POST", body: { expiryWarningDays: days } });
      state.context.tenant.expiryWarningDays = days;
      const msg = document.getElementById("expiryWarningSaved");
      msg.style.display = "block";
      setTimeout(() => { msg.style.display = "none"; }, 2500);
    });
  } else {
    const isDark = document.body.dataset.theme === "dark";
    target.innerHTML = `
      <div class="settings-section">
        <h3>Aparencia</h3>
        <p>Ajuste o visual da interface do ALL Assist.</p>
        <div class="settings-row">
          <div class="settings-row-label"><strong>Tema</strong><small>Claro ou escuro</small></div>
          <button class="btn-secondary" type="button" id="settingsThemeToggle">
            ${isDark ? "☀️ Mudar para claro" : "🌙 Mudar para escuro"}
          </button>
        </div>
        <div class="settings-row">
          <div class="settings-row-label"><strong>Tema atual</strong><small>Salvo automaticamente</small></div>
          <span class="badge badge-neutral">${isDark ? "Escuro" : "Claro"}</span>
        </div>
      </div>
    `;
    document.getElementById("settingsThemeToggle")?.addEventListener("click", () => {
      const next = document.body.dataset.theme === "dark" ? "light" : "dark";
      setTheme(next);
      renderSettingsContent("appearance");
    });
  }
}

function updateFilterTabCounts(containerId, counts) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.querySelectorAll(".filter-tab").forEach((tab) => {
    const key = tab.dataset.filter;
    const count = counts[key];
    if (count === undefined) return;
    const existing = tab.querySelector(".tab-count");
    if (existing) {
      existing.textContent = count;
    } else if (count > 0) {
      tab.insertAdjacentHTML("beforeend", `<span class="tab-count">${count}</span>`);
    }
  });
}

async function loadAll() {
  setStatus("Atualizando dados");
  const me = await api("/api/auth/me");
  state.currentUser = me.user;
  state.context = me.context;
  renderNavigationPermissions();

  const [dashboard, deals, pipelines, contacts, conversations, users, roles, products, erpIntegration, integrationSchedules, support, waSettings] = await Promise.all([
    api("/api/dashboard"),
    api("/api/deals"),
    api("/api/pipelines"),
    api("/api/contacts"),
    api("/api/conversations"),
    api("/api/users").catch(() => ({ data: [] })),
    api("/api/roles").catch(() => ({ data: [] })),
    api("/api/products").catch(() => ({ data: [] })),
    hasPermission("settings:manage") ? api("/api/integrations/erp").catch(() => null) : Promise.resolve(null),
    hasPermission("settings:manage") ? api("/api/integrations/schedules").catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
    hasPermission("support:view") ? loadSupportData() : Promise.resolve(null),
    hasPermission("settings:manage") ? api("/api/whatsapp/settings").catch(() => null) : Promise.resolve(null)
  ]);

  state.dashboard = dashboard;
  state.deals = deals.data || [];
  state.pipelines = pipelines.data || [];
  if (!state.selectedPipelineId || !state.pipelines.some((pipeline) => pipeline.id === state.selectedPipelineId)) {
    state.selectedPipelineId = state.pipelines[0]?.id || "";
  }
  state.contacts = contacts.data || [];
  state.conversations = conversations.data || [];
  state.users = users.data || [];
  state.roles = roles.data || [];
  state.products = products.data || [];
  state.erpIntegration = erpIntegration;
  state.integrationSchedules = integrationSchedules.data || [];
  state.support = support;
  state.waSettings = waSettings;

  renderCurrentUser();
  renderDashboard();
  renderReports();
  renderDeals();
  renderQuotesTable();
  renderContactsTable();
  renderConversations();
  renderUsersTable();
  renderProducts();
  renderSettings();
  renderErpSettings();
  renderIntegrationSchedules();
  renderSupport();
  renderAiInsights();
  renderAutomations();
  renderWaTemplatesSection();
  setStatus("Online");
}

function renderCurrentUser() {
  const name = state.currentUser?.name || "Usuario";
  const tenant = state.context?.tenant?.name || state.currentUser?.tenant?.name || "Empresa";
  document.getElementById("userPill").textContent = initials(name);
  document.getElementById("userPill").title = `${name} - ${state.currentUser?.role?.name || ""}`;
  document.getElementById("tenantPill").textContent = tenant;
  document.getElementById("tenantPill").title = `Ambiente ativo: ${tenant}`;
}

function renderNavigationPermissions() {
  document.querySelectorAll("nav a[data-permission]").forEach((link) => {
    link.hidden = !hasPermission(link.dataset.permission);
  });
}

function renderDashboard() {
  const model = buildDashboardModel();

  document.getElementById("metricPipelineValue").textContent = compactMoney.format(model.totalPipeline);
  document.getElementById("metricPipelineChange").innerHTML = renderTrendBadge(model.pipelineChange, "variacao no periodo");
  document.getElementById("metricWonThisMonth").textContent = compactMoney.format(model.wonAmount);
  document.getElementById("metricWonChange").innerHTML = model.wonDeals.length
    ? `<span class="trend-badge up">↑ ${model.wonDeals.length} convertidos</span>`
    : `<span class="trend-badge neutral">→ 0 convertidos</span>`;
  document.getElementById("metricWinRate").textContent = `${model.winRate.toFixed(1)}%`;
  document.getElementById("metricWinRateDetail").textContent = `${model.wonDeals.length} de ${model.deals.length} negocios`;
  document.getElementById("metricAvgDealSize").textContent = compactMoney.format(model.avgDealSize);
  document.getElementById("metricAvgDealDetail").textContent = `${model.deals.length} negocios analisados`;

  document.getElementById("metricPipelineSpark").innerHTML = renderSparkline(model.monthly.values, CHART_COLORS[0]);
  document.getElementById("metricWonSpark").innerHTML = renderSparkline(model.monthly.wonValues, CHART_COLORS[1]);
  document.getElementById("metricRateSpark").innerHTML = renderSparkline(model.monthly.countValues, CHART_COLORS[2]);
  document.getElementById("metricAvgSpark").innerHTML = renderSparkline(model.monthly.avgValues, CHART_COLORS[3]);

  document.getElementById("pipelineChart").innerHTML = renderPipelineArea(model.monthly);
  document.getElementById("stageDonut").innerHTML = renderStageDonut(model.stageRows);
  document.getElementById("stageLegend").innerHTML = renderStageLegend(model.stageRows);
  document.getElementById("topSalesReps").innerHTML = renderTopSalesReps(model.sellerRows);
  document.getElementById("leadSources").innerHTML = renderLeadSources(model.leadSources);
  document.getElementById("recentDeals").innerHTML = renderRecentDeals(model.recentDeals);
  document.getElementById("quarterlyTargets").innerHTML = renderTargets(model.targets);

  document.querySelectorAll("[data-dashboard-deal-id]").forEach((item) => {
    item.addEventListener("click", () => openDealDetail(item.dataset.dashboardDealId));
  });
}

function renderSummary(targetId, data) {
  const target = document.getElementById(targetId);
  const entries = Object.entries(data || {});
  target.innerHTML = entries.length
    ? entries.map(([name, count]) => `<div class="summary-item"><span>${escapeHtml(name)}</span><strong>${count}</strong></div>`).join("")
    : `<div class="empty-state">Sem dados ainda.</div>`;
}

function buildDashboardModel() {
  const deals = state.deals || [];
  const contacts = state.contacts || [];
  const wonDeals = deals.filter(isWonDeal);
  const totalPipeline = deals.reduce((sum, deal) => sum + dealAmount(deal), 0);
  const wonAmount = wonDeals.reduce((sum, deal) => sum + dealAmount(deal), 0);
  const avgDealSize = deals.length ? totalPipeline / deals.length : 0;
  const winRate = deals.length ? (wonDeals.length / deals.length) * 100 : 0;
  const monthly = buildMonthlySeries(deals);
  const pipelineChange = calculateChange(monthly.values);
  const stageRows = buildStageRows(deals);
  const sellerRows = buildSellerRows(deals);
  const leadSources = buildLeadSources(contacts);
  const recentDeals = [...deals]
    .sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")))
    .slice(0, 8);

  return {
    deals,
    contacts,
    wonDeals,
    totalPipeline,
    wonAmount,
    avgDealSize,
    winRate,
    monthly,
    pipelineChange,
    stageRows,
    sellerRows,
    leadSources,
    recentDeals,
    targets: buildTargets({ totalPipeline, wonDeals, contacts, deals })
  };
}

function buildMonthlySeries(deals) {
  const now = new Date();
  const months = [];
  for (let offset = 11; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    months.push({
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
      label: MONTH_LABELS[date.getMonth()],
      value: 0,
      won: 0,
      count: 0
    });
  }

  const byKey = new Map(months.map((month) => [month.key, month]));
  for (const deal of deals) {
    const date = parseDealDate(deal);
    if (!date) continue;
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const month = byKey.get(key);
    if (!month) continue;
    const amount = dealAmount(deal);
    month.value += amount;
    month.count += 1;
    if (isWonDeal(deal)) month.won += amount;
  }

  const values = months.map((month) => month.value);
  const wonValues = months.map((month) => month.won);
  const countValues = months.map((month) => month.count);
  const avgValues = months.map((month) => month.count ? month.value / month.count : 0);

  return {
    months,
    values,
    wonValues,
    countValues,
    avgValues
  };
}

function buildStageRows(deals) {
  const grouped = new Map();
  for (const deal of deals) {
    const stage = deal.stage || "Entrada";
    const row = grouped.get(stage) || {
      name: stage,
      count: 0,
      amount: 0
    };
    row.count += 1;
    row.amount += dealAmount(deal);
    grouped.set(stage, row);
  }

  return [...grouped.values()]
    .sort((a, b) => stageIndex(a.name) - stageIndex(b.name))
    .map((row, index) => ({
      ...row,
      color: CHART_COLORS[index % CHART_COLORS.length]
    }));
}

function buildSellerRows(deals) {
  const grouped = new Map();
  for (const deal of deals) {
    const seller = deal.assignedSeller || "Sem vendedor";
    const row = grouped.get(seller) || {
      name: seller,
      market: "Carteira",
      deals: 0,
      won: 0,
      revenue: 0
    };
    row.deals += 1;
    row.revenue += dealAmount(deal);
    if (isWonDeal(deal)) row.won += 1;
    grouped.set(seller, row);
  }

  return [...grouped.values()]
    .map((row) => ({
      ...row,
      winRate: row.deals ? Math.round((row.won / row.deals) * 100) : 0
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);
}

function buildLeadSources(contacts) {
  const grouped = new Map();
  for (const contact of contacts) {
    const source = sourceLabel(contact.source || "manual");
    grouped.set(source, (grouped.get(source) || 0) + 1);
  }

  if (!grouped.size) grouped.set("Sem origem", 0);

  return [...grouped.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

function buildTargets({ totalPipeline, wonDeals, contacts, deals }) {
  const pipelineTarget = Math.max(120000, Math.ceil((totalPipeline * 1.35 || 120000) / 1000) * 1000);
  const dealsTarget = Math.max(25, Math.ceil((deals.length * 1.5 || 25)));
  const contactsTarget = Math.max(50, Math.ceil((contacts.length * 1.5 || 50)));

  return [
    {
      label: "Valor em aberto",
      value: totalPipeline,
      target: pipelineTarget,
      displayValue: compactMoney.format(totalPipeline),
      displayTarget: compactMoney.format(pipelineTarget),
      color: "accent"
    },
    {
      label: "Negocios convertidos",
      value: wonDeals.length,
      target: dealsTarget,
      displayValue: String(wonDeals.length),
      displayTarget: String(dealsTarget),
      color: "cyan"
    },
    {
      label: "Clientes sincronizados",
      value: contacts.length,
      target: contactsTarget,
      displayValue: String(contacts.length),
      displayTarget: String(contactsTarget),
      color: "blue"
    }
  ];
}

function renderSparkline(values, color) {
  const safeValues = values.some((value) => value > 0) ? values : [2, 3, 2.6, 3.8, 3.2, 4.4, 4.1, 5.1, 5.6, 6.1, 6.5, 7];
  const points = svgPoints(safeValues, 220, 44, 4);
  return `
    <svg viewBox="0 0 220 44" aria-hidden="true">
      <polyline points="${points}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></polyline>
    </svg>
  `;
}

function renderPipelineArea(monthly, showCount = false) {
  const rawValues = showCount ? monthly.countValues : monthly.values;
  const fallbackValues = showCount
    ? [2, 3, 4, 5, 4, 6, 7, 8, 7, 9, 10, 12]
    : [40000, 38000, 51000, 47000, 54000, 50000, 62000, 59000, 71000, 67000, 79000, 85000];
  const values = rawValues.some((value) => value > 0) ? rawValues : fallbackValues;
  const width = 820;
  const height = 240;
  const left = 64;
  const right = 16;
  const top = 20;
  const bottom = 40;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const max = Math.max(1, ...values) * 1.18;
  const points = values.map((value, index) => {
    const x = left + (chartWidth / Math.max(1, values.length - 1)) * index;
    const y = top + chartHeight - (value / max) * chartHeight;
    return [x, y];
  });
  const linePath = points.map(([x, y], index) => `${index ? "L" : "M"} ${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L ${points.at(-1)[0].toFixed(1)} ${top + chartHeight} L ${left} ${top + chartHeight} Z`;
  const grid = [1, 0.75, 0.5, 0.25, 0].map((ratio) => {
    const y = top + chartHeight - ratio * chartHeight;
    return `
      <line x1="${left}" y1="${y}" x2="${width - right}" y2="${y}" class="chart-grid-line"></line>
      <text x="10" y="${y + 5}" class="chart-axis-label">${showCount ? Math.round(max * ratio) : compactMoney.format(max * ratio)}</text>
    `;
  }).join("");
  const labels = monthly.months.map((month, index) => {
    const x = left + (chartWidth / Math.max(1, values.length - 1)) * index;
    return `<text x="${x}" y="${height - 14}" text-anchor="middle" class="chart-axis-label">${month.label}</text>`;
  }).join("");

  return `
    <svg viewBox="0 0 ${width} ${height}" class="area-chart" role="img" aria-label="Evolucao mensal do funil comercial">
      <defs>
        <linearGradient id="pipelineFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="#00bc8f" stop-opacity="0.28"></stop>
          <stop offset="100%" stop-color="#00bc8f" stop-opacity="0.02"></stop>
        </linearGradient>
      </defs>
      ${grid}
      <path d="${areaPath}" fill="url(#pipelineFill)"></path>
      <path d="${linePath}" fill="none" stroke="#00bc8f" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></path>
      ${labels}
    </svg>
  `;
}

function renderStageDonut(rows) {
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const gradient = total
    ? buildConicGradient(rows, total)
    : "#142622";
  return `
    <div class="stage-donut" style="background: ${gradient}">
      <div>
        <strong>${total}</strong>
        <span>Negocios</span>
      </div>
    </div>
  `;
}

function renderStageLegend(rows) {
  if (!rows.length) return `<div class="empty-state compact">Sem negocios no funil comercial.</div>`;
  return rows.map((row) => `
    <div class="stage-legend-row">
      <span class="legend-dot" style="background:${row.color}"></span>
      <strong>${escapeHtml(row.name)}</strong>
      <small>${row.count}</small>
    </div>
  `).join("");
}

function renderTopSalesReps(rows) {
  if (!rows.length) return `<div class="empty-state compact">Sem vendedores com negocios ainda.</div>`;
  return `
    <div class="sales-row sales-head">
      <span>#</span>
      <span>Vendedor</span>
      <span>Convertidos</span>
      <span>Receita</span>
      <span>Conversao</span>
    </div>
    ${rows.map((row, index) => `
      <div class="sales-row">
        <span>${index + 1}</span>
        <div class="sales-rep">
          <span class="avatar">${escapeHtml(initials(row.name))}</span>
          <div>
            <strong>${escapeHtml(row.name)}</strong>
            <small>${escapeHtml(row.market)}</small>
          </div>
        </div>
        <strong>${row.won}</strong>
        <strong>${compactMoney.format(row.revenue)}</strong>
        <div class="win-rate">
          <span style="width:${Math.max(4, row.winRate)}%"></span>
          <small>${row.winRate}%</small>
        </div>
      </div>
    `).join("")}
  `;
}

function renderLeadSources(rows) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return rows.map((row) => `
    <div class="lead-source-row">
      <span>${escapeHtml(row.name)}</span>
      <div class="lead-source-track">
        <strong style="width:${Math.max(4, (row.value / max) * 100)}%"></strong>
      </div>
      <small>${row.value}</small>
    </div>
  `).join("");
}

function renderRecentDeals(rows) {
  if (!rows.length) return `<div class="empty-state compact">Sem negocios recentes.</div>`;
  return `
    <div class="recent-row recent-head">
      <span>Negocio</span>
      <span>Cliente</span>
      <span>Valor</span>
      <span>Etapa</span>
      <span>Data</span>
    </div>
    ${rows.map((deal) => `
      <button class="recent-row" type="button" data-dashboard-deal-id="${escapeHtml(deal.id)}">
        <strong>${escapeHtml(deal.title || `Pedido ${deal.externalOrderId}`)}</strong>
        <span>${escapeHtml(deal.contactName || "")}</span>
        <strong>${compactMoney.format(dealAmount(deal))}</strong>
        <span class="stage-pill ${escapeHtml(stagePillClass(deal.stage))}">${escapeHtml(deal.stage || "")}</span>
        <span>${escapeHtml(formatShortDate(deal.movementDate || deal.updatedAt))}</span>
      </button>
    `).join("")}
  `;
}

function renderTargets(rows) {
  return rows.map((row) => {
    const progress = Math.min(100, Math.round((Number(row.value || 0) / Math.max(1, Number(row.target || 1))) * 100));
    return `
      <div class="target-row ${escapeHtml(row.color)}">
        <div>
          <strong>${escapeHtml(row.label)}</strong>
          <span>${progress}%</span>
        </div>
        <div class="target-track"><span style="width:${progress}%"></span></div>
        <small>${escapeHtml(row.displayValue)} / objetivo ${escapeHtml(row.displayTarget)}</small>
      </div>
    `;
  }).join("");
}

function renderDeals() {
  renderPipelineSelector();
  renderDealKanban({
    targetId: "dealBoard",
    query: document.getElementById("dealSearch").value
  });
}

function renderPipelineSelector() {
  const select = document.getElementById("pipelineSelect");
  select.innerHTML = state.pipelines.length
    ? state.pipelines.map((pipeline) => `<option value="${escapeHtml(pipeline.id)}">${escapeHtml(pipeline.name)}</option>`).join("")
    : `<option value="">Nenhuma pipeline</option>`;
  select.value = state.selectedPipelineId || "";
}

function renderDealKanban({ targetId, query = "" }) {
  const target = document.getElementById(targetId);
  const pipeline = currentPipeline();
  const q = normalizeText(query);
  const deals = state.deals.filter((deal) => {
    const searchText = normalizeText(`${deal.title} ${deal.contactName} ${deal.contactPhone} ${deal.externalOrderId} ${deal.assignedSeller}`);
    return dealPipelineId(deal) === pipeline?.id && (!q || searchText.includes(q));
  });

  const stageNames = pipeline?.stages?.length ? pipeline.stages.map((stage) => stage.name) : STAGE_ORDER;
  const stages = [...new Set([...stageNames, ...deals.map((deal) => deal.stage || "Entrada")])];
  target.innerHTML = stages.map((stage) => renderKanbanColumn(stage, deals.filter((deal) => (deal.stage || "Entrada") === stage))).join("");

  target.querySelectorAll(".deal-card").forEach((card) => {
    card.setAttribute("draggable", "true");
    card.addEventListener("click", (event) => {
      if (event.target.closest(".wa-icon-btn")) return;
      if (event.target.closest(".phone-edit-btn")) return;
      openDealDetail(card.dataset.dealId);
    });
    card.addEventListener("dragstart", (event) => {
      event.dataTransfer.setData("text/plain", card.dataset.dealId);
      card.classList.add("dragging");
    });
    card.addEventListener("dragend", () => card.classList.remove("dragging"));
  });

  target.querySelectorAll(".kanban-cards").forEach((col) => {
    col.addEventListener("dragover", (event) => {
      event.preventDefault();
      col.classList.add("drag-over");
    });
    col.addEventListener("dragleave", () => col.classList.remove("drag-over"));
    col.addEventListener("drop", async (event) => {
      event.preventDefault();
      col.classList.remove("drag-over");
      const dealId = event.dataTransfer.getData("text/plain");
      const stage = col.closest(".kanban-column")?.dataset.stage;
      if (!dealId || !stage) return;
      const deal = state.deals.find((d) => d.id === dealId);
      if (!deal || (deal.stage || "Entrada") === stage) return;
      try {
        await api(`/api/deals/${encodeURIComponent(dealId)}`, {
          method: "PATCH",
          body: JSON.stringify({ stage })
        });
        state.deals = state.deals.map((d) => d.id === dealId ? { ...d, stage } : d);
        renderDeals();
        setStatus(`Negocio movido para "${stage}"`);
        setTimeout(() => setStatus("Online"), 3000);
      } catch (error) {
        setStatus(`Erro ao mover: ${error.message}`);
      }
    });
  });

  target.querySelectorAll(".wa-icon-btn").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      const deal = state.deals.find((d) => d.id === btn.dataset.dealId);
      if (deal) openWhatsAppModal(deal);
    });
  });
}

function currentPipeline() {
  return state.pipelines.find((pipeline) => pipeline.id === state.selectedPipelineId) || state.pipelines[0] || null;
}

function dealPipelineId(deal) {
  if (deal.pipelineId) return deal.pipelineId;
  const kind = getDealKind(deal);
  const pipeline = state.pipelines.find((item) => item.kind === kind);
  return pipeline?.id || "";
}

function showPipelineForm(mode) {
  const form = document.getElementById("pipelineForm");
  const pipeline = currentPipeline();
  state.pipelineFormMode = mode;
  document.getElementById("pipelineOverlay").classList.remove("hidden");
  document.getElementById("pipelineDrawerEyebrow").textContent = mode === "edit" ? "Editar funil" : "Novo funil";
  document.getElementById("pipelineDrawerTitle").textContent = mode === "edit" && pipeline ? pipeline.name : "Nova pipeline";
  form.name.value = mode === "edit" && pipeline ? pipeline.name : "";
  form.stages.value = mode === "edit" && pipeline
    ? (pipeline.stages || []).map((stage) => stage.name).join("\n")
    : STAGE_ORDER.join("\n");
  document.getElementById("pipelineFormHint").textContent = mode === "edit"
    ? "Altere o nome ou os estagios desta pipeline. Os cards usam os nomes das etapas."
    : "Crie uma nova pipeline para separar outros processos comerciais.";
  form.name.focus();
}

function hidePipelineForm() {
  document.getElementById("pipelineOverlay").classList.add("hidden");
}

async function savePipeline(form) {
  const payload = {
    name: form.name.value,
    stages: form.stages.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  };
  const pipeline = state.pipelineFormMode === "edit" && state.selectedPipelineId
    ? await api(`/api/pipelines/${encodeURIComponent(state.selectedPipelineId)}`, {
        method: "PUT",
        body: JSON.stringify(payload)
      })
    : await api("/api/pipelines", {
        method: "POST",
        body: JSON.stringify(payload)
      });

  const reloaded = await api("/api/pipelines");
  state.pipelines = reloaded.data || [];
  state.selectedPipelineId = pipeline.id;
  hidePipelineForm();
  renderDeals();
  setStatus("Pipeline salva");
}

function renderKanbanColumn(stage, deals) {
  const total = deals.reduce((sum, deal) => sum + Number(deal.amount || 0), 0);
  return `
    <section class="kanban-column" data-stage="${escapeHtml(stage)}">
      <header class="kanban-column-header">
        <div>
          <strong>${escapeHtml(stage)}</strong>
          <p>Total: ${money.format(total)}</p>
        </div>
        <span>${deals.length}</span>
      </header>
      <div class="kanban-cards">
        ${deals.length ? deals.map(renderDealCard).join("") : `<div class="empty-column">Nenhum negocio nesta etapa</div>`}
      </div>
    </section>
  `;
}

function getDealExpiryInfo(deal) {
  if (!deal.validUntil) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(deal.validUntil + "T00:00:00");
  const diffMs = expiry - today;
  const days = Math.floor(diffMs / 86400000);
  const warningDays = Number(state.context?.tenant?.expiryWarningDays ?? 2);
  if (days < 0) return { type: "expired", label: "Vencido", days };
  if (days === 0) return { type: "expires-today", label: "Vence hoje", days };
  if (days <= warningDays) return { type: "warning", label: `Vence em ${days}d`, days };
  return null;
}

function renderDealCard(deal) {
  const rawPhone = String(deal.contactPhone || "").replace(/\D/g, "");
  const phoneValid = rawPhone.length >= 10 && rawPhone.length <= 13;
  const expiryInfo = getDealExpiryInfo(deal);
  const expiryBadge = expiryInfo
    ? `<span class="expiry-badge expiry-badge--${expiryInfo.type}">${escapeHtml(expiryInfo.label)}</span>`
    : "";
  const waIconColor = phoneValid ? "#25D366" : "var(--muted,#666)";
  const waIconTitle = phoneValid ? "Enviar mensagem WhatsApp" : "Numero invalido ou ausente";
  const waIconStyle = phoneValid ? "cursor:pointer" : "opacity:0.4;cursor:default";
  const waIcon = `<button type="button" class="wa-icon-btn" data-deal-id="${escapeHtml(deal.id)}" title="${waIconTitle}" style="background:none;border:none;padding:2px 4px;${waIconStyle}" ${phoneValid ? "" : "disabled"} aria-label="${waIconTitle}">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="${waIconColor}" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.126.558 4.121 1.535 5.849L.057 23.521a.75.75 0 0 0 .921.921l5.672-1.478A11.945 11.945 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.893 0-3.661-.523-5.169-1.427l-.371-.22-3.842 1 1.019-3.73-.24-.385A9.937 9.937 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>
  </button>`;
  return `
    <article class="deal-card kanban-card${expiryInfo?.type === "expired" ? " deal-card--expired" : expiryInfo ? " deal-card--expiry-warning" : ""}" data-deal-id="${escapeHtml(deal.id)}">
      <div class="deal-card-top">
        <span class="deal-tag ${getDealKind(deal) === "quote" ? "deal-tag-quote" : "deal-tag-order"}">${escapeHtml(getDealKindLabel(deal))}</span>
        <small>#${escapeHtml(deal.externalOrderId)}</small>
        ${expiryBadge}
      </div>
      <strong>${escapeHtml(deal.contactName || deal.title)}</strong>
      <p style="display:flex;align-items:center;gap:6px">
        <span class="deal-phone-text" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(deal.contactPhone || "Sem telefone")}</span>
        <button type="button" class="phone-edit-btn" data-deal-id="${escapeHtml(deal.id)}" data-contact-id="${escapeHtml(deal.contactId || "")}" data-contact-name="${escapeHtml(deal.contactName || "")}" data-phone="${escapeHtml(deal.contactPhone || "")}" title="Editar telefone" style="background:none;border:none;padding:2px 4px;cursor:pointer;color:var(--accent,#00d4a0);flex-shrink:0" aria-label="Editar telefone">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        ${waIcon}
      </p>
      <div class="deal-card-money">${money.format(Number(deal.amount || 0))}</div>
      <footer>
        <span>${escapeHtml(deal.assignedSeller || "Sem vendedor")}</span>
        <span>${escapeHtml(formatBrazilianDate(deal.validUntil) || "")}</span>
      </footer>
    </article>
  `;
}

function getDealKind(deal) {
  const type = normalizeText(deal.customFields?.tipoDocumento || deal.sourceRecord?.desrdav || deal.title);
  if (type.includes("orcamento")) return "quote";
  if (type.includes("pedido")) return "order";
  return "order";
}

function getDealKindLabel(deal) {
  return getDealKind(deal) === "quote" ? "Orcamento" : "Pedido";
}

function renderContacts() {
  renderContactsTable();
}

function openContactConversations(btn) {
  const phone = btn.dataset.contactPhone;
  const name = btn.dataset.contactName;
  document.querySelector('nav a[href="#conversations"]')?.click();
  convFilter = "all";
  document.querySelectorAll(".conv-filter-btn").forEach((b) => b.classList.toggle("active", b.dataset.filter === "all"));
  const searchInput = document.getElementById("convSearch");
  if (searchInput) { searchInput.value = name || phone; }
  renderConversations();
}

let convFilter = "all";
let convProviderFilter = "all";

function renderConversations() {
  const totalUnread = state.conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
  const badge = document.getElementById("convBadge");
  if (badge) {
    badge.textContent = totalUnread > 99 ? "99+" : totalUnread;
    badge.style.display = totalUnread > 0 ? "" : "none";
  }

  const q = normalizeText(document.getElementById("convSearch")?.value || "");
  const statusLabel = { waiting: "Aguardando", open: "Aberta", closed: "Encerrada" };
  const statusClass = { waiting: "conv-status-waiting", open: "conv-status-open", closed: "conv-status-closed" };

  const filtered = state.conversations.filter((c) => {
    if (convFilter !== "all" && (c.status || "open") !== convFilter) return false;
    if (convProviderFilter !== "all" && (c.provider || "meta") !== convProviderFilter) return false;
    if (q) {
      const text = normalizeText(`${c.contactName} ${c.contactPhone} ${c.lastMessagePreview}`);
      if (!text.includes(q)) return false;
    }
    return true;
  });

  document.getElementById("conversationList").innerHTML = filtered.length
    ? filtered.map((conversation) => {
        const status = conversation.status || "open";
        const isActive = conversation.id === activeConversationId;
        return `
        <div class="conversation-item${isActive ? " active" : ""}" data-id="${conversation.id}">
          <div class="conv-item-main">
            <div class="conv-item-header">
              <strong>${escapeHtml(conversation.contactName || "Desconhecido")}</strong>
              <small class="conv-time">${escapeHtml(formatShortDate(conversation.lastMessageAt || conversation.updatedAt || ""))}</small>
            </div>
            <div class="conv-item-phone">${escapeHtml(conversation.contactPhone || "")}</div>
            <div class="conv-item-footer">
              <p class="conv-preview">${escapeHtml(conversation.lastMessagePreview || "")}</p>
              <div class="conv-item-badges">
                <span class="conv-status-badge ${statusClass[status] || ""}">${statusLabel[status] || status}</span>
                <span class="conv-provider-badge conv-provider-${conversation.provider || "meta"}">${conversation.provider === "evolution" ? "Chat" : "Meta"}</span>
                ${(conversation.unreadCount || 0) > 0 ? `<span class="conv-unread-badge">${conversation.unreadCount}</span>` : ""}
              </div>
            </div>
          </div>
        </div>`;
      }).join("")
    : `<div class="empty-state">Nenhuma conversa encontrada.</div>`;

  document.querySelectorAll(".conversation-item").forEach((item) => {
    item.addEventListener("click", () => openConversation(item.dataset.id));
  });
}

function renderUsers() {
  renderUsersTable();
}

function renderErpSettings() {
  const form = document.getElementById("erpSettingsForm");
  const status = document.getElementById("erpSettingsStatus");
  if (!form || !hasPermission("settings:manage")) return;

  const settings = state.erpIntegration;
  if (!settings) {
    clearErpSettingsForm(form);
    status.textContent = "Nao carregado";
    return;
  }

  form.provider.value = settings.provider || "ciss";
  form.protocol.value = settings.protocol || "http";
  form.host.value = settings.host || "";
  form.port.value = settings.port || "";
  form.username.value = settings.username || "";
  form.password.value = "";
  form.clientId.value = settings.clientId || "";
  form.clientSecret.value = "";

  const missingCreds = !settings.username || !settings.passwordConfigured;
  const secrets = [
    settings.passwordConfigured ? "senha salva" : "senha pendente",
    settings.clientSecretConfigured ? "client secret salvo" : "client secret padrao"
  ].join(" - ");

  if (missingCreds) {
    status.textContent = "Pendente: preencha usuario e senha para sincronizar";
    status.style.color = "var(--amber, #d99700)";
  } else {
    status.textContent = settings.id
      ? `${settings.baseUrl || "Sem endereco"} - ${secrets}`
      : "Nao configurado";
    status.style.color = "";
  }

  const testResult = document.getElementById("erpTestResult");
  if (testResult && missingCreds && !settings.id) {
    testResult.className = "test-result";
    testResult.textContent = "Preencha o usuario e senha do ERP, depois clique em Testar conexao antes de salvar.";
    testResult.style.color = "var(--amber, #d99700)";
    testResult.style.borderColor = "var(--amber, #d99700)";
  } else if (testResult && testResult.className !== "test-result error" && testResult.className !== "test-result success") {
    testResult.className = "test-result hidden";
    testResult.style.color = "";
    testResult.style.borderColor = "";
  }
}

function renderIntegrationSchedules() {
  const target = document.getElementById("integrationScheduleList");
  if (!target) return;

  target.innerHTML = state.integrationSchedules.length
    ? state.integrationSchedules.map((schedule) => `
      <article class="schedule-card" data-schedule-type="${escapeHtml(schedule.entityType)}">
        <header>
          <div>
            <h3>${escapeHtml(schedule.label || scheduleLabel(schedule.entityType))}</h3>
            <p>${scheduleDescription(schedule)}</p>
          </div>
          <span class="status-chip ${schedule.enabled ? "success" : "muted"}">${schedule.enabled ? "Ativo" : "Pausado"}</span>
        </header>
        <div class="schedule-fields">
          <label>
            <span>Executar</span>
            <select name="enabled">
              <option value="true" ${schedule.enabled ? "selected" : ""}>Ativo</option>
              <option value="false" ${!schedule.enabled ? "selected" : ""}>Pausado</option>
            </select>
          </label>
          <label>
            <span>Estrategia</span>
            <select name="strategy">
              ${["incremental", "full_then_incremental", "full", "online"].map((strategy) => `
                <option value="${strategy}" ${schedule.strategy === strategy ? "selected" : ""}>${strategyLabel(strategy)}</option>
              `).join("")}
            </select>
          </label>
          <label>
            <span>Intervalo min</span>
            <input name="intervalMinutes" inputmode="numeric" value="${Number(schedule.intervalMinutes || 0)}" ${schedule.strategy === "online" ? "disabled" : ""}>
          </label>
          <label>
            <span>Cache seg</span>
            <input name="cacheTtlSeconds" inputmode="numeric" value="${Number(schedule.cacheTtlSeconds || 0)}">
          </label>
        </div>
        <footer>
          <small>Ultima execucao: ${formatDateTime(schedule.lastRunAt) || "nunca"}</small>
          <button type="button" data-save-schedule="${escapeHtml(schedule.entityType)}">Salvar agenda</button>
        </footer>
      </article>
    `).join("")
    : `<div class="empty-state compact">Sem agendas carregadas.</div>`;

  target.querySelectorAll("[data-save-schedule]").forEach((button) => {
    button.addEventListener("click", () => saveIntegrationSchedule(button.dataset.saveSchedule));
  });
}

async function saveIntegrationSchedule(entityType) {
  const card = document.querySelector(`[data-schedule-type="${CSS.escape(entityType)}"]`);
  if (!card) return;

  const payload = {
    enabled: card.querySelector('[name="enabled"]').value === "true",
    strategy: card.querySelector('[name="strategy"]').value,
    intervalMinutes: card.querySelector('[name="intervalMinutes"]').value,
    cacheTtlSeconds: card.querySelector('[name="cacheTtlSeconds"]').value
  };

  setStatus("Salvando agenda da integracao");
  const updated = await api(`/api/integrations/schedules/${encodeURIComponent(entityType)}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
  state.integrationSchedules = state.integrationSchedules.map((schedule) => (
    schedule.entityType === updated.entityType ? updated : schedule
  ));
  renderIntegrationSchedules();
  setStatus("Online");
}

function clearErpSettingsForm(form) {
  form.provider.value = "ciss";
  form.protocol.value = "http";
  form.host.value = "";
  form.port.value = "";
  form.username.value = "";
  form.password.value = "";
  form.clientId.value = "";
  form.clientSecret.value = "";
}

async function saveErpSettings(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  if (!data.password) delete data.password;
  if (!data.clientSecret) delete data.clientSecret;

  setStatus("Salvando integracao ERP");
  document.getElementById("erpSettingsStatus").textContent = "Salvando...";
  const result = document.getElementById("erpTestResult");
  result.className = "test-result hidden";
  result.textContent = "";

  try {
    state.erpIntegration = await api("/api/integrations/erp", {
      method: "PUT",
      body: JSON.stringify(data)
    });
    renderErpSettings();
    setStatus("Online");
  } catch (error) {
    document.getElementById("erpSettingsStatus").textContent = "Erro ao salvar";
    result.className = "test-result error";
    result.textContent = error.message;
    setStatus("Erro ao salvar ERP");
  }
}

async function testErpSettings(form) {
  const result = document.getElementById("erpTestResult");
  const data = Object.fromEntries(new FormData(form).entries());
  if (!data.password) delete data.password;
  if (!data.clientSecret) delete data.clientSecret;

  result.className = "test-result";
  result.textContent = "Testando conexao com o ERP...";
  setStatus("Testando ERP");

  try {
    const response = await api("/api/integrations/erp/test", {
      method: "POST",
      body: JSON.stringify(data)
    });
    result.className = "test-result success";
    result.textContent = `Conexao OK. Token recebido de ${response.baseUrl}.`;
    setStatus("Online");
  } catch (error) {
    result.className = "test-result error";
    result.textContent = error.message;
    setStatus("Erro no teste ERP");
  }
}

async function clearErpSettings(form) {
  const result = document.getElementById("erpTestResult");
  setStatus("Limpando integracao ERP");
  document.getElementById("erpSettingsStatus").textContent = "Limpando...";
  clearErpSettingsForm(form);
  result.className = "test-result hidden";
  result.textContent = "";

  try {
    state.erpIntegration = await api("/api/integrations/erp", {
      method: "DELETE"
    });
    clearErpSettingsForm(form);
    document.getElementById("erpSettingsStatus").textContent = "Nao configurado";
    setStatus("Online");
  } catch (error) {
    document.getElementById("erpSettingsStatus").textContent = "Erro ao limpar";
    result.className = "test-result error";
    result.textContent = error.message;
    setStatus("Erro ao limpar ERP");
  }
}

function renderSupport() {
  if (!state.support) return;

  document.getElementById("supportTenants").textContent = state.support.summary.tenants;
  document.getElementById("supportFailures").textContent = state.support.summary.integrationFailures;
  document.getElementById("supportSlowRequests").textContent = state.support.summary.slowRequests;
  document.getElementById("supportUsers").textContent = state.support.summary.users;

  document.getElementById("supportIntegrationEvents").innerHTML = renderSupportItems(
    state.support.recentIntegrationEvents,
    (event) => `
      <div>
        <strong>${escapeHtml(labelize(event.action || event.status))}</strong>
        <p>${escapeHtml(event.message || event.sourceKey || "Evento de integracao")}</p>
        <small>${escapeHtml(event.sourceKey || event.provider)} - ${escapeHtml(formatDateTime(event.createdAt))}</small>
      </div>
      <span class="support-status ${escapeHtml(event.status)}">${escapeHtml(event.status)}</span>
    `
  );

  document.getElementById("supportRequestStats").innerHTML = renderSupportItems(
    state.support.requestStats,
    (item) => `
      <div>
        <strong>${escapeHtml(item.route)}</strong>
        <p>${item.count} chamadas - media ${item.avgDurationMs}ms - max ${item.maxDurationMs}ms</p>
        <small>${item.errors} erros - ${item.slow} lentas</small>
      </div>
      <span>${item.avgDurationMs}ms</span>
    `
  );

  document.getElementById("supportTenantList").innerHTML = renderSupportItems(
    state.support.tenants,
    (tenant) => `
      <div>
        <strong>${escapeHtml(tenant.name)}</strong>
        <p>${tenantUsage(tenant, "users")} usuarios - ${tenantUsage(tenant, "contacts")} contatos - ${tenantUsage(tenant, "deals")} negocios</p>
        <small>${escapeHtml(tenant.slug)}.*.allassist.com.br - ${escapeHtml(statusLabel(tenant.status))}</small>
      </div>
      <div class="support-actions">
        <span>${escapeHtml(tenant.plan || "plano")}</span>
        <button type="button" data-tenant-switch="${escapeHtml(tenant.id)}">Entrar</button>
      </div>
    `
  );

  document.querySelectorAll("[data-tenant-switch]").forEach((button) => {
    button.addEventListener("click", () => switchTenant(button.dataset.tenantSwitch));
  });

  document.getElementById("supportLogs").innerHTML = renderSupportItems(
    state.support.logs,
    (event) => `
      <div>
        <strong>${escapeHtml(event.event || event.error || event.message || event.raw || "Log")}</strong>
        <p>${escapeHtml(event.message || event.error || event.level || "")}</p>
        <small>${escapeHtml(formatDateTime(event.ts || event.createdAt))}</small>
      </div>
      <span class="support-status ${escapeHtml(event.level || "info")}">${escapeHtml(event.level || "log")}</span>
    `,
    "Sem logs recentes."
  );
}

async function loadSupportData() {
  const overview = await api("/api/support/overview").catch(() => null);
  if (!overview) return null;
  const tenants = hasPermission("support:tenants")
    ? await api("/api/support/tenants").catch(() => ({ data: overview.tenants || [] }))
    : { data: overview.tenants || [] };
  const logs = hasPermission("support:logs")
    ? await api("/api/support/logs?limit=30").catch(() => ({ data: [] }))
    : { data: [] };
  return {
    ...overview,
    tenants: tenants.data || overview.tenants || [],
    logs: logs.data || []
  };
}

async function createTenant(form) {
  const result = document.getElementById("tenantFormResult");
  const data = Object.fromEntries(new FormData(form).entries());
  result.textContent = "Cadastrando cliente...";
  setStatus("Cadastrando tenant");

  try {
    const tenant = await api("/api/support/tenants", {
      method: "POST",
      body: JSON.stringify(data)
    });
    result.textContent = `Cliente criado: ${tenant.slug}.*.allassist.com.br`;
    form.reset();
    state.support = await loadSupportData();
    renderSupport();
    setStatus("Online");
  } catch (error) {
    result.textContent = error.message;
    setStatus("Erro ao cadastrar tenant");
  }
}

async function switchTenant(tenantId) {
  setStatus("Trocando ambiente");
  await api("/api/support/active-tenant", {
    method: "PUT",
    body: JSON.stringify({ tenantId })
  });
  await loadAll();
}

function tenantUsage(tenant, key) {
  return tenant.usage?.[key] ?? tenant[key] ?? 0;
}

function statusLabel(status) {
  const labels = {
    active: "Ativo",
    trial: "Teste",
    paused: "Pausado",
    blocked: "Bloqueado",
    implantacao: "Implantação",
    producao: "Produção"
  };
  return labels[status] || status || "Ativo";
}

function renderSupportItems(items, renderer, emptyMessage = "Sem dados recentes.") {
  if (!items?.length) return `<div class="empty-state compact">${emptyMessage}</div>`;
  return items.map((item) => `<div class="support-item">${renderer(item)}</div>`).join("");
}

let activeConversationId = null;

async function openConversation(id) {
  activeConversationId = id;
  const conversation = await api(`/api/conversations/${id}`);

  api(`/api/conversations/${id}/read`, { method: "POST" }).catch(() => {});
  const localConv = state.conversations.find((c) => c.id === id);
  if (localConv) localConv.unreadCount = 0;

  document.querySelectorAll(".conversation-item").forEach((el) => {
    el.classList.toggle("active", el.dataset.id === id);
    if (el.dataset.id === id) {
      el.querySelector(".conv-unread-badge")?.remove();
    }
  });

  const messagesHtml = (conversation.messages || []).map((message) => `
    <div class="message ${message.direction}">
      <p>${escapeHtml(message.body)}</p>
      <div class="msg-meta">
        <small>${formatDateTime(message.createdAt)}</small>
        ${message.direction === "outbound" ? renderMsgStatus(message.status) : ""}
      </div>
    </div>
  `).join("");

  const isClosed = conversation.status === "closed";
  document.getElementById("conversationDetail").innerHTML = `
    <div class="panel-title">
      <div>
        <h2>${escapeHtml(conversation.contactName)}</h2>
        <span>${escapeHtml(conversation.contactPhone)}</span>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <span class="conv-status-badge conv-status-${conversation.status || "open"}">${{ waiting: "Aguardando", open: "Aberta", closed: "Encerrada" }[conversation.status] || "Aberta"}</span>
        ${!isClosed
          ? `<button class="btn btn-sm btn-danger" id="closeConvBtn">Encerrar</button>`
          : `<button class="btn btn-sm btn-secondary" id="reopenConvBtn">Reabrir</button>`}
      </div>
    </div>
    <div id="conversationMessages" class="conversation-messages">
      ${messagesHtml || `<div class="empty-state">Nenhuma mensagem ainda.</div>`}
    </div>
  `;

  document.getElementById("closeConvBtn")?.addEventListener("click", async () => {
    await api(`/api/conversations/${id}`, { method: "PATCH", body: JSON.stringify({ status: "closed" }) });
    const c = state.conversations.find((x) => x.id === id);
    if (c) c.status = "closed";
    renderConversations();
    await openConversation(id);
  });

  document.getElementById("reopenConvBtn")?.addEventListener("click", async () => {
    await api(`/api/conversations/${id}`, { method: "PATCH", body: JSON.stringify({ status: "open" }) });
    const c = state.conversations.find((x) => x.id === id);
    if (c) c.status = "open";
    renderConversations();
    await openConversation(id);
  });

  const msgs = document.getElementById("conversationMessages");
  if (msgs) msgs.scrollTop = msgs.scrollHeight;

  const replyBox = document.getElementById("conversationReplyBox");
  const replyBtn = document.getElementById("conversationReplyBtn");
  const replyText = document.getElementById("conversationReplyText");
  replyBox.classList.remove("hidden");
  replyBox.classList.toggle("conv-reply-disabled", isClosed);
  replyText.disabled = isClosed;
  replyText.placeholder = isClosed ? "Conversa encerrada." : "Digite sua mensagem...";
  replyBtn.disabled = isClosed;
  if (!isClosed) { replyText.value = ""; replyText.focus(); }

  replyBtn.onclick = () => sendConversationReply(id);
  replyText.onkeydown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendConversationReply(id);
    }
  };
}

async function sendConversationReply(id) {
  const replyText = document.getElementById("conversationReplyText");
  const replyBtn = document.getElementById("conversationReplyBtn");
  const body = replyText.value.trim();
  if (!body) return;

  replyBtn.disabled = true;
  replyBtn.textContent = "Enviando...";
  try {
    await api(`/api/conversations/${id}/messages`, {
      method: "POST",
      body: JSON.stringify({ body })
    });
    replyText.value = "";
    await openConversation(id);
  } catch (err) {
    alert("Erro ao enviar: " + (err.message || "tente novamente"));
  } finally {
    replyBtn.disabled = false;
    replyBtn.textContent = "Enviar";
  }
}

async function openDealDetail(id) {
  setStatus("Carregando pedido");
  const deal = await api(`/api/deals/${encodeURIComponent(id)}`);
  document.getElementById("dealDrawerTitle").textContent = deal.title || `Pedido ${deal.externalOrderId}`;
  document.getElementById("dealDetail").innerHTML = renderDealDetail(deal);
  document.getElementById("dealOverlay").classList.remove("hidden");
  setStatus("Online");
}

function closeDealDrawer() {
  document.getElementById("dealOverlay").classList.add("hidden");
}

function renderDealDetail(deal) {
  const summary = {
    pedido: deal.externalOrderId,
    empresa: deal.companyId,
    cliente: deal.contactName,
    telefone: deal.contactPhone,
    valor: money.format(Number(deal.amount || 0)),
    etapa: deal.stage,
    status: deal.status,
    vendedor: deal.assignedSeller,
    usuarioErp: deal.cissUser,
    dataMovimento: formatBrazilianDate(deal.movementDate),
    validade: formatBrazilianDate(deal.validUntil),
    ultimaSincronizacao: formatDateTime(deal.lastSyncedAt)
  };

  const linkedDeal = renderLinkedDealBanner(deal);

  return `
    ${linkedDeal}
    <section class="detail-section">
      <h3>Resumo do pedido</h3>
      ${renderKeyValueGrid(summary)}
    </section>
    <section class="detail-section">
      <h3>Contato vinculado</h3>
      ${renderKeyValueGrid(deal.contact || {})}
    </section>
    <section class="detail-section">
      <h3>Campos personalizados</h3>
      ${renderKeyValueGrid(deal.customFields || {})}
    </section>
    <section class="detail-section">
      <h3>JSON recebido do ERP</h3>
      ${renderKeyValueGrid(deal.sourceRecord || deal.customFields || {})}
    </section>
    <section class="detail-section">
      <h3>Historico</h3>
      ${renderDealLogs(deal.logs || [])}
    </section>
  `;
}

function renderLinkedDealBanner(deal) {
  const parts = [];

  if (deal.originQuoteId) {
    const originNumber = deal.customFields?.idOrcamentoOrigem || deal.originQuoteId;
    parts.push(`
      <div class="linked-deal-banner linked-deal-banner--origin">
        <span class="linked-deal-icon">📋</span>
        <div>
          <small>Originado do orçamento</small>
          <strong>#${escapeHtml(String(originNumber))}</strong>
        </div>
        <button class="linked-deal-btn" onclick="openDealDetail('${escapeHtml(deal.originQuoteId)}')">
          Ver orçamento →
        </button>
      </div>
    `);
  }

  const ordersFromThis = state.deals.filter(
    (d) => d.originQuoteId === deal.id
  );
  for (const order of ordersFromThis) {
    parts.push(`
      <div class="linked-deal-banner linked-deal-banner--converted">
        <span class="linked-deal-icon">✅</span>
        <div>
          <small>Efetivado como pedido de venda</small>
          <strong>#${escapeHtml(String(order.externalOrderId))}</strong>
        </div>
        <button class="linked-deal-btn" onclick="openDealDetail('${escapeHtml(order.id)}')">
          Ver pedido →
        </button>
      </div>
    `);
  }

  return parts.join("");
}

function renderKeyValueGrid(data, options = {}) {
  const entries = Object.entries(data || {}).filter(([, value]) => value !== "" && value !== null && value !== undefined);
  if (!entries.length) return `<div class="empty-state compact">Sem dados para exibir.</div>`;

  return `
    <div class="detail-grid">
      ${entries.map(([key, value]) => `
        <div class="detail-field">
          <span>${escapeHtml(labelize(key))}</span>
          <strong>${escapeHtml(formatDetailValue(value, key))}</strong>
        </div>
      `).join("")}
    </div>
  `;
}

function renderDealLogs(logs) {
  if (!logs.length) return `<div class="empty-state compact">Sem historico ainda.</div>`;
  const sorted = logs.slice().reverse();

  const renderLogItem = (log) => {
    let detail = "";
    if (log.type === "erp_updated" && Array.isArray(log.metadata?.changes) && log.metadata.changes.length > 0) {
      detail = `<table class="erp-diff-table">
        <thead><tr><th>Campo</th><th>Antes</th><th>Depois</th></tr></thead>
        <tbody>
          ${log.metadata.changes.map((c) => `
            <tr>
              <td>${escapeHtml(labelize(c.field) || c.field)}</td>
              <td class="erp-diff-before">${escapeHtml(formatDiffValue(c.field, c.before))}</td>
              <td class="erp-diff-after">${escapeHtml(formatDiffValue(c.field, c.after))}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>`;
    }
    const itemClass = log.type === "erp_updated"
      ? " history-item--erp"
      : log.type === "quote_converted"
        ? " history-item--converted"
        : "";
    return `<div class="history-item${itemClass}">
      <strong>${escapeHtml(labelize(log.type))}</strong>
      <p>${escapeHtml(log.note)}</p>
      ${detail}
      <small>${escapeHtml(formatDateTime(log.createdAt))}</small>
    </div>`;
  };

  const first = renderLogItem(sorted[0]);
  if (sorted.length === 1) return first;

  const rest = sorted.slice(1).map(renderLogItem).join("");
  const uid = `log-history-${Math.random().toString(36).slice(2, 8)}`;
  return `
    ${first}
    <div id="${uid}-more" style="display:none">${rest}</div>
    <button class="btn-history-toggle" onclick="
      var el = document.getElementById('${uid}-more');
      var open = el.style.display !== 'none';
      el.style.display = open ? 'none' : 'block';
      this.textContent = open ? 'Ver histórico completo (${sorted.length - 1})' : 'Ocultar histórico';
    ">Ver histórico completo (${sorted.length - 1})</button>
  `;
}

function applySavedTheme() {
  setTheme(localStorage.getItem("allassist-theme") || "dark", false);
}

function setTheme(theme, persist = true) {
  document.body.dataset.theme = theme;
  const isDark = theme === "dark";
  document.getElementById("themeToggle").textContent = isDark ? "Tema claro" : "Tema escuro";
  if (persist) {
    localStorage.setItem("allassist-theme", theme);
  }
}

function labelize(value) {
  if (FIELD_LABELS[value]) return FIELD_LABELS[value];

  return String(value || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/\bCiss\b/g, "ERP")
    .replace(/\bCISS\b/g, "ERP");
}

function formatDetailValue(value, key = "") {
  if (Array.isArray(value)) return value.map((item) => formatDetailValue(item, key)).join(", ");
  if (value && typeof value === "object") return JSON.stringify(value);
  if (String(value).toLowerCase() === "ciss") return "ERP";
  if (isDateField(key) || isIsoDateLike(value)) return formatBrazilianDate(value);
  return value;
}

function formatDateTime(value) {
  return formatBrazilianDate(value, { includeTime: true });
}

function formatDiffValue(field, value) {
  if (!value) return "—";
  if (/^\d{4}-\d{2}-\d{2}/.test(String(value))) return formatBrazilianDate(value);
  return value;
}

function formatBrazilianDate(value, options = {}) {
  if (!value) return "";
  const text = String(value);
  const isoParts = text.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{2}):(\d{2}))?/);
  if (isoParts) {
    const [, year, month, day, hour, minute] = isoParts;
    const datePart = `${day.padStart(2, "0")}/${month.padStart(2, "0")}/${year}`;
    const hasTextTime = hour !== undefined && minute !== undefined;
    if (options.includeTime && !hasTextTime) return datePart;
    return hasTextTime ? `${datePart} ${hour}:${minute}` : datePart;
  }

  const date = parseDateValue(text);
  if (!date) return value;

  const hasTime = options.includeTime || /[T ]\d{2}:\d{2}/.test(text);
  const datePart = date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });

  if (!hasTime) return datePart;

  const timePart = date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit"
  });
  return `${datePart} ${timePart}`;
}

function parseDateValue(value) {
  const text = String(value || "").trim();
  const dateOnly = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isDateField(key) {
  const normalized = normalizeText(key);
  return [
    "data",
    "date",
    "dt",
    "validade",
    "createdat",
    "updatedat",
    "deletedat",
    "lastseenat",
    "lastsyncedat",
    "ultimasincronizacao",
    "datamovimento",
    "datavalidade",
    "dtmovimento",
    "dtvalidade",
    "dtagendacontato"
  ].some((term) => normalized.includes(term));
}

function isIsoDateLike(value) {
  return typeof value === "string" && /^\d{4}-\d{1,2}-\d{1,2}(?:[T ][\d:.+-Z]+)?$/.test(value.trim());
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isWonDeal(deal) {
  const statusText = normalizeText([
    deal.status,
    deal.stage,
    deal.customFields?.statusPedido,
    deal.customFields?.statusGestao,
    deal.sourceRecord?.status,
    deal.sourceRecord?.flagaprovado,
    deal.sourceRecord?.flagprenota,
    deal.sourceRecord?.flagimportado
  ].join(" "));

  return [
    "ganho",
    "venda efetivada",
    "efetivado",
    "faturado",
    "gerou documento fiscal",
    "nota gerada",
    "aprovado"
  ].some((term) => statusText.includes(normalizeText(term)));
}

function dealAmount(deal) {
  const value = deal.amount
    ?? deal.customFields?.valorPedido
    ?? deal.customFields?.valtotliquido
    ?? deal.sourceRecord?.valtotliquido
    ?? 0;
  const numeric = Number(String(value).replace(",", "."));
  return Number.isFinite(numeric) ? numeric : 0;
}

function parseDealDate(deal) {
  const value = deal.movementDate
    || deal.sourceRecord?.dtmovimento
    || deal.updatedAt
    || deal.createdAt
    || deal.lastSyncedAt;
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function calculateChange(values) {
  const realValues = values.filter((value) => Number(value) > 0);
  if (!realValues.length) return 0;
  if (realValues.length === 1) return 100;

  const current = realValues.at(-1);
  const previous = realValues.at(-2);
  if (!previous) return current ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

function formatChange(value, suffix = "") {
  const normalized = Number.isFinite(value) ? value : 0;
  const signal = normalized >= 0 ? "+" : "";
  const formatted = `${signal}${normalized.toFixed(1).replace(".", ",")}%`;
  return suffix ? `${formatted} ${suffix}` : formatted;
}

function svgPoints(values, width, height, padding = 0) {
  const max = Math.max(1, ...values);
  const min = Math.min(...values, max);
  const range = Math.max(1, max - min);
  const usableWidth = width - padding * 2;
  const usableHeight = height - padding * 2;

  return values.map((value, index) => {
    const x = padding + (usableWidth / Math.max(1, values.length - 1)) * index;
    const y = padding + usableHeight - ((value - min) / range) * usableHeight;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

function buildConicGradient(rows, total) {
  let cursor = 0;
  const slices = rows.map((row) => {
    const size = (row.count / Math.max(1, total)) * 100;
    const slice = `${row.color} ${cursor.toFixed(2)}% ${(cursor + size).toFixed(2)}%`;
    cursor += size;
    return slice;
  });
  return `conic-gradient(${slices.join(", ")})`;
}

function stageIndex(name) {
  const index = STAGE_ORDER.findIndex((stage) => normalizeText(stage) === normalizeText(name));
  return index >= 0 ? index : STAGE_ORDER.length + 1;
}

function sourceLabel(source) {
  const normalized = normalizeText(source);
  if (normalized.includes("ciss") || normalized.includes("erp")) return "ERP";
  if (normalized.includes("whatsapp") || normalized.includes("meta")) return "WhatsApp";
  if (normalized.includes("webhook")) return "Webhook";
  if (normalized.includes("manual")) return "Manual";
  return labelize(source || "Sem origem");
}

function scheduleLabel(entityType) {
  return {
    orders: "Pedidos e orcamentos",
    products: "Produtos",
    stock: "Estoque",
    customers: "Clientes",
    sellers: "Vendedores"
  }[entityType] || labelize(entityType);
}

function strategyLabel(strategy) {
  return {
    incremental: "Incremental",
    full_then_incremental: "Carga geral + incremental",
    full: "Carga geral",
    online: "Consulta online"
  }[strategy] || labelize(strategy);
}

function scheduleDescription(schedule) {
  if (schedule.strategy === "online") {
    return `Consulta sob demanda com cache de ${Number(schedule.cacheTtlSeconds || 0)} segundos.`;
  }
  return `Roda a cada ${Number(schedule.intervalMinutes || 0)} minuto(s) usando ${strategyLabel(schedule.strategy).toLowerCase()}.`;
}

function formatShortDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "");
}

function hasPermission(permission) {
  return Boolean(state.currentUser?.permissions?.includes(permission));
}

function initials(name) {
  const parts = String(name || "Usuario").trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] || "U") + (parts[1]?.[0] || "");
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json"
    },
    ...options
  });
  if (!response.ok) {
    if (response.status === 401) {
      window.location.href = `/login.html?next=${encodeURIComponent(window.location.pathname)}`;
      return new Promise(() => {});
    }
    let message = `Erro ${response.status}`;
    try {
      const body = await response.json();
      message = body.error || body.message || message;
    } catch {
      // Mantem mensagem padrao quando a resposta nao for JSON.
    }
    throw new Error(message);
  }
  return response.json();
}

function renderTrendBadge(value, label = "no periodo") {
  const normalized = Number.isFinite(value) ? value : 0;
  const cls = normalized > 0.5 ? "up" : normalized < -0.5 ? "down" : "neutral";
  const arrow = cls === "up" ? "↑" : cls === "down" ? "↓" : "→";
  const signal = normalized >= 0 ? "+" : "";
  const text = `${signal}${normalized.toFixed(1).replace(".", ",")}%`;
  return `<span class="trend-badge ${cls}" title="${escapeHtml(label)}">${arrow} ${text}</span>`;
}

function stagePillClass(stage) {
  const s = normalizeText(stage || "");
  if (["venda efetivada", "gerou documento fiscal", "aprovado", "faturado", "ganho"].some((t) => s.includes(t))) {
    return "stage-pill-won";
  }
  if (["pedido negado", "cancelado", "negado", "perdido"].some((t) => s.includes(t))) {
    return "stage-pill-lost";
  }
  if (["em negociacao", "negociacao", "proposta", "qualificado"].some((t) => s.includes(t))) {
    return "stage-pill-active";
  }
  return "";
}

function setStatus(text) {
  document.getElementById("statusPill").textContent = text;
}

function renderMsgStatus(status) {
  switch (status) {
    case "sending":
    case "queued":
      return `<span class="msg-status msg-status-sending" title="Enviando">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      </span>`;
    case "sent":
      return `<span class="msg-status msg-status-sent" title="Enviado">
        <svg width="16" height="10" viewBox="0 0 16 10" fill="none"><polyline points="1,5 5,9 14,1" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </span>`;
    case "delivered":
      return `<span class="msg-status msg-status-delivered" title="Entregue">
        <svg width="20" height="10" viewBox="0 0 20 10" fill="none"><polyline points="1,5 5,9 14,1" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><polyline points="6,5 10,9 19,1" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </span>`;
    case "read":
      return `<span class="msg-status msg-status-read" title="Lido">
        <svg width="20" height="10" viewBox="0 0 20 10" fill="none"><polyline points="1,5 5,9 14,1" stroke="#53bdeb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><polyline points="6,5 10,9 19,1" stroke="#53bdeb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </span>`;
    case "failed":
      return `<span class="msg-status msg-status-failed" title="Falha no envio">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
      </span>`;
    default:
      return "";
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* ══════════════════════════════════════
   WHATSAPP — templates e envio
══════════════════════════════════════ */

const WA_VARIABLE_KEYS = ["customer_name", "order_id", "deal_value", "deal_stage", "seller_name", "deal_date", "company_name", "company_phone"];

function buildWaVariables(deal) {
  const settings = state.waSettings || {};
  const defaults = settings.defaultVariables || {};
  return {
    customer_name: deal.contactName || deal.title || "",
    order_id: deal.sourceOrderId || deal.externalOrderId || deal.id || "",
    deal_value: money.format(Number(deal.amount || 0)),
    deal_stage: deal.stage || "",
    seller_name: deal.assignedSeller || "",
    deal_date: formatBrazilianDate(deal.createdAt) || "",
    company_name: defaults.company_name || "",
    company_phone: defaults.company_phone || ""
  };
}

function extractTemplateBodyText(template) {
  if (!template || !Array.isArray(template.components)) return "";
  const body = template.components.find((c) => c.type === "BODY");
  return body?.text || "";
}

function applyVariablesToText(text, vars) {
  let result = text;
  Object.entries(vars).forEach(([key, value]) => {
    result = result.replaceAll(`{{${key}}}`, value).replaceAll(`@${key}`, value);
  });
  // Substituir {{1}}, {{2}}, etc. com valores na ordem
  const orderedVals = Object.values(vars);
  result = result.replace(/\{\{(\d+)\}\}/g, (_, idx) => orderedVals[Number(idx) - 1] || `{{${idx}}}`);
  return result;
}

function buildTemplateComponents(template, vars) {
  if (!template || !Array.isArray(template.components)) return [];
  const body = template.components.find((c) => c.type === "BODY");
  if (!body?.text) return [];
  const text = body.text;

  // Variáveis nomeadas: {{customer_name}}, {{order_id}}
  const namedMatches = [...text.matchAll(/\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g)];
  if (namedMatches.length) {
    const parameters = namedMatches.map((m) => ({
      type: "text",
      parameter_name: m[1],
      text: String(vars[m[1]] ?? "")
    }));
    return [{ type: "body", parameters }];
  }

  // Variáveis numéricas: {{1}}, {{2}}
  const numericMatches = [...text.matchAll(/\{\{(\d+)\}\}/g)];
  if (!numericMatches.length) return [];
  const orderedVals = Object.values(vars);
  const parameters = numericMatches.map((m) => ({
    type: "text",
    text: String(orderedVals[Number(m[1]) - 1] ?? "")
  }));
  return [{ type: "body", parameters }];
}

function renderWaTemplatesSection() {
  const form = document.getElementById("waSettingsForm");
  const statusEl = document.getElementById("waSettingsStatus");
  if (!form) return;

  const settings = state.waSettings || {};
  const defaults = settings.defaultVariables || {};
  if (form.company_name) form.company_name.value = defaults.company_name || "";
  if (form.company_phone) form.company_phone.value = defaults.company_phone || "";
  if (statusEl) statusEl.textContent = settings.id ? "Configuracoes salvas" : "";

  renderWaTemplatesList();
}

function renderWaTemplatesList() {
  const listEl = document.getElementById("waTemplatesList");
  if (!listEl) return;
  const templates = state.waTemplates || [];
  if (!templates.length) {
    listEl.innerHTML = `<div class="empty-state compact">Nenhum template aprovado encontrado. Clique em "Atualizar" para buscar da Meta.</div>`;
    return;
  }
  listEl.innerHTML = templates.map((t) => {
    const bodyText = extractTemplateBodyText(t);
    return `
      <div class="detail-section" style="padding:12px 0;border-bottom:1px solid var(--border,#2a2a3e)">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
          <div>
            <strong style="font-size:14px">${escapeHtml(t.name)}</strong>
            <span style="margin-left:8px;font-size:11px;color:var(--muted)">${escapeHtml(t.language || "")}</span>
            <span class="stage-pill stage-pill-won" style="margin-left:8px;font-size:10px;padding:2px 6px">${escapeHtml(t.status || "")}</span>
          </div>
        </div>
        ${bodyText ? `<p style="margin:8px 0 0;font-size:13px;color:var(--muted);white-space:pre-wrap">${escapeHtml(bodyText)}</p>` : ""}
      </div>
    `;
  }).join("");
}

async function loadWaTemplates() {
  const statusEl = document.getElementById("waSettingsStatus");
  if (statusEl) statusEl.textContent = "Buscando templates...";
  try {
    const result = await api("/api/whatsapp/templates");
    state.waTemplates = result.data || [];
    renderWaTemplatesList();
    if (statusEl) statusEl.textContent = `${state.waTemplates.length} templates carregados`;
  } catch (error) {
    if (statusEl) statusEl.textContent = `Erro: ${error.message}`;
    const listEl = document.getElementById("waTemplatesList");
    if (listEl) listEl.innerHTML = `<div class="empty-state compact" style="color:var(--danger,#dc3d6a)">${escapeHtml(error.message)}</div>`;
  }
}

async function saveWaSettings(form) {
  const statusEl = document.getElementById("waSettingsStatus");
  try {
    const data = {
      wabaId: state.waSettings?.wabaId || "",
      defaultVariables: {
        company_name: form.company_name?.value || "",
        company_phone: form.company_phone?.value || ""
      }
    };
    const saved = await api("/api/whatsapp/settings", {
      method: "PUT",
      body: JSON.stringify(data)
    });
    state.waSettings = saved;
    if (statusEl) statusEl.textContent = "Salvo com sucesso";
    setTimeout(() => { if (statusEl) statusEl.textContent = ""; }, 3000);
  } catch (error) {
    if (statusEl) statusEl.textContent = `Erro: ${error.message}`;
  }
}

async function openWhatsAppModal(deal) {
  const overlay = document.getElementById("waModalOverlay");
  const toInput = document.getElementById("waModalTo");
  const templateSelect = document.getElementById("waModalTemplate");
  const languageInput = document.getElementById("waModalLanguage");
  const errorEl = document.getElementById("waModalError");
  if (!overlay) return;

  // Preencher numero
  const rawPhone = String(deal.contactPhone || "").replace(/\D/g, "");
  toInput.value = rawPhone || "";
  errorEl.style.display = "none";

  // Carregar templates se ainda nao carregados
  if (!state.waTemplates.length) {
    templateSelect.innerHTML = `<option value="">Carregando templates...</option>`;
    try {
      const result = await api("/api/whatsapp/templates");
      state.waTemplates = result.data || [];
    } catch {
      state.waTemplates = [];
    }
  }

  // Preencher select de templates
  templateSelect.innerHTML = state.waTemplates.length
    ? `<option value="">Selecione um template</option>` + state.waTemplates.map((t) => `<option value="${escapeHtml(t.name)}" data-language="${escapeHtml(t.language || "pt_BR")}">${escapeHtml(t.name)} (${escapeHtml(t.language || "")})</option>`).join("")
    : `<option value="">Nenhum template disponivel</option>`;

  overlay.dataset.dealId = deal.id;
  updateWaModalPreview(deal);
  overlay.classList.remove("hidden");

  templateSelect.onchange = () => {
    const opt = templateSelect.selectedOptions[0];
    if (opt?.dataset.language) languageInput.value = opt.dataset.language;
    updateWaModalPreview(deal);
  };
  toInput.oninput = () => updateWaModalPreview(deal);
}

function updateWaModalPreview(deal) {
  const templateSelect = document.getElementById("waModalTemplate");
  const previewEl = document.getElementById("waModalPreview");
  const previewText = document.getElementById("waModalPreviewText");
  const varsSection = document.getElementById("waModalVarsSection");
  const varFields = document.getElementById("waModalVarFields");
  if (!templateSelect || !previewEl) return;

  const templateName = templateSelect.value;
  const template = state.waTemplates.find((t) => t.name === templateName);
  if (!template) {
    previewEl.style.display = "none";
    if (varsSection) varsSection.style.display = "none";
    return;
  }

  const vars = buildWaVariables(deal);
  const bodyText = extractTemplateBodyText(template);
  if (bodyText) {
    previewEl.style.display = "";
    previewText.textContent = applyVariablesToText(bodyText, vars);
  } else {
    previewEl.style.display = "none";
  }

  // Mostrar variaveis disponiveis
  if (varsSection && varFields) {
    varsSection.style.display = "";
    varFields.innerHTML = WA_VARIABLE_KEYS.map((k) => `
      <div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0;border-bottom:1px solid var(--border,#2a2a3e)">
        <span style="color:var(--muted)">@${escapeHtml(k)}</span>
        <span>${escapeHtml(String(vars[k] || ""))}</span>
      </div>
    `).join("");
  }
}

function closeWaModal() {
  const overlay = document.getElementById("waModalOverlay");
  if (overlay) overlay.classList.add("hidden");
  const errorEl = document.getElementById("waModalError");
  if (errorEl) errorEl.style.display = "none";
}

/* ══════════════════════════════════════
   IA INSIGHTS — análise heurística local
   (placeholder para integração com LLM)
══════════════════════════════════════ */
function renderAiInsights() {
  const deals = state.deals || [];
  const contacts = state.contacts || [];
  const now = Date.now();
  const MS_30_DAYS = 30 * 24 * 60 * 60 * 1000;
  const MS_7_DAYS = 7 * 24 * 60 * 60 * 1000;

  const riskDeals = deals.filter((deal) => {
    if (isWonDeal(deal)) return false;
    const lastActivity = new Date(deal.lastSyncedAt || deal.updatedAt || deal.createdAt || 0).getTime();
    return (now - lastActivity) > MS_30_DAYS;
  });

  const hotDeals = deals.filter((deal) => {
    if (isWonDeal(deal)) return false;
    const amount = dealAmount(deal);
    const s = normalizeText(deal.stage || "");
    return amount > 10000 && (s.includes("negociacao") || s.includes("proposta") || s.includes("aguardando"));
  });

  const followupDeals = deals.filter((deal) => {
    const lastActivity = new Date(deal.lastSyncedAt || deal.updatedAt || deal.createdAt || 0).getTime();
    return !isWonDeal(deal) && (now - lastActivity) > MS_7_DAYS && (now - lastActivity) < MS_30_DAYS;
  }).slice(0, 6);

  const wonDeals = deals.filter(isWonDeal);
  const winRate = deals.length ? (wonDeals.length / deals.length) * 100 : 0;
  const avgAmount = deals.length ? deals.reduce((s, d) => s + dealAmount(d), 0) / deals.length : 0;
  const projectedWin = Math.round(followupDeals.length * (winRate / 100));
  const projectedRevenue = projectedWin * avgAmount;

  const riskEl = document.getElementById("aiRiskCount");
  const hotEl = document.getElementById("aiHotCount");
  if (riskEl) riskEl.textContent = riskDeals.length;
  if (hotEl) hotEl.textContent = hotDeals.length;

  const banner = document.getElementById("aiAlertBanner");
  if (banner) {
    if (riskDeals.length > 0) {
      banner.innerHTML = `
        <div class="ai-alert">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
          <span><strong>${riskDeals.length} negocio${riskDeals.length > 1 ? "s" : ""} sem atividade ha mais de 30 dias</strong> — revise e entre em contato para nao perder a oportunidade.</span>
        </div>
      `;
    } else {
      banner.innerHTML = `
        <div class="ai-alert ai-alert-ok">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>
          <span>Todos os negocios ativos tem atividade recente. Boa gestao comercial!</span>
        </div>
      `;
    }
  }

  const kpisEl = document.getElementById("aiInsightsKpis");
  if (kpisEl) {
    kpisEl.innerHTML = [
      { label: "Negocios em risco", value: riskDeals.length, sub: "sem atividade +30 dias", color: "metric-rose" },
      { label: "Oportunidades quentes", value: hotDeals.length, sub: "alta probabilidade", color: "metric-cyan" },
      { label: "Para follow-up", value: followupDeals.length, sub: "nos proximos 7 dias", color: "metric-amber" },
      { label: "Receita prevista", value: compactMoney.format(projectedRevenue), sub: `${projectedWin} conversoes estimadas`, color: "metric-accent" }
    ].map((card) => `
      <article class="metric-card ${card.color}">
        <span>${card.label}</span>
        <strong>${card.value}</strong>
        <small>${card.sub}</small>
      </article>
    `).join("");
  }

  const riskEl2 = document.getElementById("aiRiskDeals");
  if (riskEl2) {
    riskEl2.innerHTML = riskDeals.length
      ? riskDeals.slice(0, 6).map((deal) => `
          <div class="ai-deal-row">
            <div class="table-name-cell">
              <span class="table-avatar avatar-rose">${escapeHtml(initials(deal.contactName || "?"))}</span>
              <div>
                <strong>${escapeHtml(deal.contactName || deal.title || "Sem nome")}</strong>
                <small>${escapeHtml(deal.contactPhone || "Sem telefone")} — ${compactMoney.format(dealAmount(deal))}</small>
              </div>
            </div>
            <span class="badge badge-danger">Em risco</span>
          </div>
        `).join("")
      : `<div class="empty-state compact">Nenhum negocio em risco identificado.</div>`;
  }

  const hotEl2 = document.getElementById("aiHotDeals");
  if (hotEl2) {
    hotEl2.innerHTML = hotDeals.length
      ? hotDeals.slice(0, 6).map((deal) => `
          <div class="ai-deal-row">
            <div class="table-name-cell">
              <span class="table-avatar">${escapeHtml(initials(deal.contactName || "?"))}</span>
              <div>
                <strong>${escapeHtml(deal.contactName || deal.title || "Sem nome")}</strong>
                <small>${escapeHtml(deal.stage || "Sem etapa")} — ${compactMoney.format(dealAmount(deal))}</small>
              </div>
            </div>
            <span class="badge badge-success">Quente</span>
          </div>
        `).join("")
      : `<div class="empty-state compact">Nenhuma oportunidade quente identificada.</div>`;
  }

  const followEl = document.getElementById("aiFollowupList");
  if (followEl) {
    followEl.innerHTML = followupDeals.length
      ? followupDeals.map((deal) => `
          <div class="ai-followup-row">
            <div>
              <strong>${escapeHtml(deal.contactName || deal.title || "Negocio")}</strong>
              <small>${escapeHtml(deal.contactPhone || "")} — ${escapeHtml(deal.assignedSeller || "Sem vendedor")}</small>
            </div>
            <div class="ai-followup-actions">
              <span class="badge badge-warning">Follow-up</span>
              ${deal.contactPhone
                ? `<a class="btn-wa" href="https://wa.me/55${deal.contactPhone.replace(/\D/g,"")}" target="_blank" rel="noopener">WhatsApp</a>`
                : ""}
            </div>
          </div>
        `).join("")
      : `<div class="empty-state compact">Nenhum follow-up pendente no periodo.</div>`;
  }

  const predEl = document.getElementById("aiPredictions");
  if (predEl) {
    predEl.innerHTML = `
      <div class="ai-prediction-grid">
        <div class="ai-prediction-item">
          <span>Taxa de conversao atual</span>
          <strong>${winRate.toFixed(1)}%</strong>
        </div>
        <div class="ai-prediction-item">
          <span>Ticket medio</span>
          <strong>${compactMoney.format(avgAmount)}</strong>
        </div>
        <div class="ai-prediction-item">
          <span>Negocios em andamento</span>
          <strong>${deals.filter((d) => !isWonDeal(d)).length}</strong>
        </div>
        <div class="ai-prediction-item">
          <span>Receita potencial</span>
          <strong>${compactMoney.format(deals.filter((d) => !isWonDeal(d)).reduce((s, d) => s + dealAmount(d), 0))}</strong>
        </div>
        <div class="ai-prediction-item ai-prediction-wide">
          <span>Previsao de receita (se taxa atual mantida)</span>
          <strong class="ai-prediction-highlight">${compactMoney.format(projectedRevenue)}</strong>
        </div>
      </div>
      <p class="ai-disclaimer">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
        Analise baseada nos dados do CRM. Integracao com modelo de IA avancada disponivel em breve.
      </p>
    `;
  }
}

/* ══════════════════════════════════════
   AUTOMAÇÕES WHATSAPP
══════════════════════════════════════ */
function renderAutomations() {
  const kpisEl = document.getElementById("automationKpis");
  if (kpisEl) {
    const convs = state.conversations || [];
    const totalUnread = convs.reduce((s, c) => s + (c.unreadCount || 0), 0);
    const openConvs = convs.filter((c) => c.status === "open" || !c.status).length;
    kpisEl.innerHTML = [
      { label: "Conversas abertas", value: openConvs, sub: "aguardando resposta", color: "metric-accent" },
      { label: "Nao lidas", value: totalUnread, sub: "mensagens pendentes", color: "metric-amber" },
      { label: "Contatos com WhatsApp", value: (state.contacts || []).filter((c) => c.phone).length, sub: "telefones cadastrados", color: "metric-cyan" },
      { label: "Regras ativas", value: 0, sub: "automacoes configuradas", color: "metric-blue" }
    ].map((card) => `
      <article class="metric-card ${card.color}">
        <span>${card.label}</span>
        <strong>${card.value}</strong>
        <small>${card.sub}</small>
      </article>
    `).join("");
  }

  const rulesEl = document.getElementById("automationRulesList");
  if (rulesEl) {
    rulesEl.innerHTML = `
      <div class="automation-empty">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--line)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path></svg>
        <strong>Nenhuma regra criada ainda</strong>
        <p>As regras de automacao permitem disparar mensagens automaticamente quando um negocio muda de etapa, quando um cliente nao responde, ou em datas especificas.</p>
        <button class="btn-primary" type="button" onclick="setStatus('Automacoes — disponivel em breve');setTimeout(()=>setStatus('Online'),3000)">
          Criar primeira regra
        </button>
      </div>
    `;
  }

  const templatesEl = document.getElementById("automationTemplatesList");
  if (templatesEl) {
    const builtinTemplates = [
      { name: "Boas-vindas", trigger: "Novo contato", status: "draft" },
      { name: "Follow-up 7 dias", trigger: "Sem resposta em 7 dias", status: "draft" },
      { name: "Confirmacao de pedido", trigger: "Pedido aprovado", status: "draft" }
    ];
    templatesEl.innerHTML = builtinTemplates.map((tpl) => `
      <div class="template-row">
        <div>
          <strong>${escapeHtml(tpl.name)}</strong>
          <small>${escapeHtml(tpl.trigger)}</small>
        </div>
        <span class="badge badge-neutral">Rascunho</span>
      </div>
    `).join("");
  }

  const historyEl = document.getElementById("automationHistoryList");
  if (historyEl) {
    historyEl.innerHTML = `<div class="empty-state compact">Nenhum disparo automatico realizado ainda.</div>`;
  }
}

/* ══════════════════════════════════════
   MODAL DE CONVITE
══════════════════════════════════════ */
function openInviteModal() {
  const select = document.getElementById("inviteRoleSelect");
  if (select && state.roles.length) {
    select.innerHTML = state.roles.map((role) =>
      `<option value="${escapeHtml(role.id)}">${escapeHtml(role.name)}</option>`
    ).join("");
  }
  document.getElementById("inviteOverlay").classList.remove("hidden");
  document.getElementById("inviteUserForm")?.querySelector("input[name='name']")?.focus();
}

function closeInviteModal() {
  document.getElementById("inviteOverlay").classList.add("hidden");
  document.getElementById("inviteUserForm")?.reset();
  const hint = document.getElementById("inviteFormHint");
  if (hint) hint.textContent = "Um email com o link de acesso sera enviado ao usuario.";
  hint?.classList.remove("invite-hint-error", "invite-hint-success");
}

async function submitInvite(form) {
  const hint = document.getElementById("inviteFormHint");
  const data = Object.fromEntries(new FormData(form).entries());
  if (hint) {
    hint.textContent = "Enviando convite...";
    hint.className = "";
  }
  setStatus("Enviando convite");

  try {
    const result = await api("/api/users/invites", {
      method: "POST",
      body: JSON.stringify(data)
    });
    const token = result?.invite?.token || result?.token;
    if (hint) {
      hint.textContent = token
        ? `Convite criado! Token: ${token.slice(0, 12)}... — envie o link manualmente.`
        : "Convite criado com sucesso!";
      hint.className = "invite-hint-success";
    }
    form.reset();
    const reloaded = await api("/api/users").catch(() => ({ data: [] }));
    state.users = reloaded.data || [];
    renderUsersTable();
    setStatus("Online");
    setTimeout(closeInviteModal, 3500);
  } catch (error) {
    if (hint) {
      hint.textContent = `Erro: ${error.message}`;
      hint.className = "invite-hint-error";
    }
    setStatus("Erro ao convidar");
  }
}

// ── Auto-refresh de conversas ────────────────────────────────────────────
setInterval(async () => {
  try {
    const result = await api("/api/conversations");
    const previous = state.conversations || [];
    state.conversations = result.data || [];

    const hasNewMessages = state.conversations.some((c) => {
      const prev = previous.find((p) => p.id === c.id);
      return !prev || (c.unreadCount || 0) > (prev.unreadCount || 0);
    });
    if (hasNewMessages) {
      const badge = document.getElementById("convBadge");
      if (badge) badge.classList.add("badge-pulse");
      setTimeout(() => badge?.classList.remove("badge-pulse"), 3000);
    }

    renderConversations();

    if (activeConversationId) {
      const active = state.conversations.find((c) => c.id === activeConversationId);
      const prev = previous.find((c) => c.id === activeConversationId);
      if (active && prev && active.lastMessageAt !== prev.lastMessageAt) {
        await openConversation(activeConversationId);
      }
    }
  } catch { /* silencioso */ }
}, 30_000);

// ── Edição de telefone inline ────────────────────────────────────────────
(function initPhoneEdit() {
  const overlay = document.getElementById("phoneEditOverlay");
  const input = document.getElementById("phoneEditInput");
  const saveBtn = document.getElementById("phoneEditSave");
  const cancelBtn = document.getElementById("phoneEditCancel");
  const errorEl = document.getElementById("phoneEditError");
  const nameEl = document.getElementById("phoneEditContactName");
  if (!overlay) return;

  let activeContactId = null;
  let activeDealId = null;

  function openPhoneEdit({ contactId, dealId, contactName, phone }) {
    activeContactId = contactId;
    activeDealId = dealId;
    nameEl.textContent = contactName || "Contato";
    input.value = phone || "";
    errorEl.style.display = "none";
    overlay.style.display = "flex";
    setTimeout(() => input.focus(), 50);
  }

  function closePhoneEdit() {
    overlay.style.display = "none";
    activeContactId = null;
    activeDealId = null;
  }

  async function savePhone() {
    const phone = input.value.replace(/\D/g, "").trim();
    if (!phone) { errorEl.textContent = "Informe um telefone válido."; errorEl.style.display = ""; return; }
    if (!activeContactId) { errorEl.textContent = "Contato não identificado."; errorEl.style.display = ""; return; }
    saveBtn.disabled = true;
    saveBtn.textContent = "Salvando...";
    errorEl.style.display = "none";
    try {
      await api(`/api/contacts/${encodeURIComponent(activeContactId)}`, {
        method: "PATCH",
        body: JSON.stringify({ phone })
      });
      state.contacts = state.contacts.map((c) => c.id === activeContactId ? { ...c, phone } : c);
      state.deals = state.deals.map((d) => {
        if (d.contactId === activeContactId || d.id === activeDealId) {
          return { ...d, contactPhone: phone };
        }
        return d;
      });
      renderDeals();
      renderContactsTable();
      closePhoneEdit();
      setStatus("Telefone atualizado");
      setTimeout(() => setStatus("Online"), 3000);
    } catch (error) {
      errorEl.textContent = error.message;
      errorEl.style.display = "";
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = "Salvar";
    }
  }

  overlay.addEventListener("click", (event) => { if (event.target === overlay) closePhoneEdit(); });
  cancelBtn.addEventListener("click", closePhoneEdit);
  saveBtn.addEventListener("click", savePhone);
  input.addEventListener("keydown", (event) => { if (event.key === "Enter") savePhone(); if (event.key === "Escape") closePhoneEdit(); });

  document.addEventListener("click", (event) => {
    const btn = event.target.closest(".phone-edit-btn");
    if (!btn) return;
    event.stopPropagation();
    openPhoneEdit({
      contactId: btn.dataset.contactId,
      dealId: btn.dataset.dealId,
      contactName: btn.dataset.contactName,
      phone: btn.dataset.phone
    });
  });
})();

// Edição de contato completo
(function setupContactEdit() {
  const overlay = document.getElementById("contactEditOverlay");
  if (!overlay) return;
  const saveBtn = document.getElementById("contactEditSave");
  const cancelBtn = document.getElementById("contactEditCancel");
  const errorEl = document.getElementById("contactEditError");
  let activeId = null;

  function openContactEdit(btn) {
    const id = btn.dataset.contactId;
    const contact = state.contacts.find((c) => c.id === id);
    if (!contact) return;
    activeId = id;
    document.getElementById("contactEditName").value = contact.name || "";
    document.getElementById("contactEditPhone").value = contact.phone || "";
    document.getElementById("contactEditEmail").value = contact.email || "";
    document.getElementById("contactEditCity").value = contact.city || "";
    document.getElementById("contactEditState").value = contact.state || "";
    document.getElementById("contactEditDocument").value = contact.document || "";
    document.getElementById("contactEditNotes").value = contact.notes || "";
    errorEl.style.display = "none";
    overlay.style.display = "flex";
  }

  function closeContactEdit() {
    overlay.style.display = "none";
    activeId = null;
  }

  async function saveContact() {
    if (!activeId) return;
    const payload = {
      name: document.getElementById("contactEditName").value.trim(),
      phone: document.getElementById("contactEditPhone").value.replace(/\D/g, "").trim(),
      email: document.getElementById("contactEditEmail").value.trim(),
      city: document.getElementById("contactEditCity").value.trim(),
      state: document.getElementById("contactEditState").value.trim(),
      document: document.getElementById("contactEditDocument").value.trim(),
      notes: document.getElementById("contactEditNotes").value.trim()
    };
    if (!payload.name) { errorEl.textContent = "Nome é obrigatório."; errorEl.style.display = ""; return; }
    saveBtn.disabled = true;
    saveBtn.textContent = "Salvando...";
    errorEl.style.display = "none";
    try {
      const updated = await api(`/api/contacts/${encodeURIComponent(activeId)}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
      state.contacts = state.contacts.map((c) => c.id === activeId ? { ...c, ...updated } : c);
      state.deals = state.deals.map((d) => d.contactId === activeId ? { ...d, contactPhone: updated.phone || d.contactPhone } : d);
      renderContactsTable();
      renderDeals();
      closeContactEdit();
      setStatus("Contato atualizado");
      setTimeout(() => setStatus("Online"), 3000);
    } catch (error) {
      errorEl.textContent = error.message;
      errorEl.style.display = "";
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = "Salvar";
    }
  }

  overlay.addEventListener("click", (event) => { if (event.target === overlay) closeContactEdit(); });
  cancelBtn.addEventListener("click", closeContactEdit);
  saveBtn.addEventListener("click", saveContact);
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && overlay.style.display !== "none") closeContactEdit(); });

  document.addEventListener("click", (event) => {
    const btn = event.target.closest(".contact-edit-btn");
    if (!btn) return;
    event.stopPropagation();
    openContactEdit(btn);
  });
})();

// WhatsApp Chat (Evolution API)
let evoQrPollInterval = null;

async function renderWhatsAppChat() {
  const isAdmin = hasPermission("settings:manage");

  // Painel do servidor (admin)
  const serverPanel = document.getElementById("evoServerPanel");
  if (serverPanel) serverPanel.style.display = isAdmin ? "" : "none";

  // Painel de todas as instâncias (admin)
  const allPanel = document.getElementById("evoAllInstancesPanel");
  if (allPanel) allPanel.style.display = isAdmin ? "" : "none";

  if (isAdmin) await loadEvoServerConfig();
  await loadMyEvoInstance();
  if (isAdmin) await loadAllEvoInstances();
  await loadEvoBanTips();
}

async function loadEvoServerConfig() {
  try {
    const result = await api("/api/evolution/server-config");
    const cfg = result.data;
    const badge = document.getElementById("evoServerStatus");
    if (badge) {
      badge.textContent = cfg ? "Configurado" : "Nao configurado";
      badge.className = `status-chip ${cfg ? "status-chip-active" : "status-chip-paused"}`;
    }
    const form = document.getElementById("evoServerForm");
    if (form && cfg) form.apiUrl.value = cfg.apiUrl || "";
  } catch { /**/ }
}

async function loadMyEvoInstance() {
  try {
    const result = await api("/api/evolution/my-instance");
    const instance = result.data;
    renderEvoStatus(instance);
    const nameEl = document.getElementById("evoMyInstanceName");
    if (nameEl) nameEl.textContent = instance ? instance.instanceName : "";
    const notice = document.getElementById("evoServerNotice");
    if (notice) notice.style.display = "none";
    if (instance) {
      renderEvoAntiBan(instance.antiBan);
      renderEvoWarmup(instance.warmup);
      if (instance.status === "qr_pending" && instance.lastQrCode) {
        showEvoQr(instance.lastQrCode);
        startQrPoll();
      } else {
        hideEvoQr();
      }
    }
  } catch (error) {
    if (error.message?.includes("servidor Evolution")) {
      const notice = document.getElementById("evoServerNotice");
      if (notice) notice.style.display = "";
    }
    setStatus(`Erro ao carregar instância: ${error.message}`);
  }
}

async function loadAllEvoInstances() {
  try {
    const result = await api("/api/evolution/instances");
    const instances = result.data || [];
    const list = document.getElementById("evoAllInstancesList");
    if (!list) return;
    if (!instances.length) {
      list.innerHTML = `<div class="empty-state" style="padding:20px">Nenhum usuario conectou um numero ainda.</div>`;
      return;
    }
    const statusMap = {
      connected: { label: "Conectado", cls: "status-chip-active" },
      connecting: { label: "Conectando...", cls: "status-chip-trial" },
      qr_pending: { label: "Aguardando QR", cls: "status-chip-trial" },
      disconnected: { label: "Desconectado", cls: "status-chip-paused" }
    };
    list.innerHTML = `<div class="evo-instances-list">
      ${instances.map((inst) => {
        const s = statusMap[inst.status] || { label: inst.status, cls: "status-chip-paused" };
        const sentToday = inst.stats?.sentToday || 0;
        return `<div class="evo-instance-row">
          <div class="evo-instance-user">
            <strong>${escapeHtml(inst.userName || "Sem usuario")}</strong>
            <span style="font-size:11px;font-family:monospace;color:var(--muted)">${escapeHtml(inst.instanceName || "")}</span>
          </div>
          <div style="display:flex;align-items:center;gap:10px">
            <span style="font-size:12px;color:var(--muted)">${sentToday} msgs hoje</span>
            <span class="status-chip ${s.cls}" style="font-size:11px">${s.label}</span>
          </div>
        </div>`;
      }).join("")}
    </div>`;
  } catch { /**/ }
}

function renderEvoStatus(instance) {
  const badge = document.getElementById("evoStatusBadge");
  const connectBtn = document.getElementById("evoConnectBtn");
  const disconnectBtn = document.getElementById("evoDisconnectBtn");
  if (!badge) return;

  const statusMap = {
    connected: { label: "Conectado", cls: "status-chip-active" },
    connecting: { label: "Conectando...", cls: "status-chip-trial" },
    qr_pending: { label: "Aguardando QR code", cls: "status-chip-trial" },
    disconnected: { label: "Desconectado", cls: "status-chip-paused" },
    not_configured: { label: "Nao configurado", cls: "status-chip-paused" }
  };
  const status = instance?.status || "not_configured";
  const info = statusMap[status] || { label: status, cls: "status-chip-paused" };
  badge.textContent = info.label;
  badge.className = `status-chip ${info.cls}`;

  if (connectBtn) connectBtn.style.display = status === "connected" ? "none" : "";
  if (disconnectBtn) disconnectBtn.style.display = status === "connected" ? "" : "none";
}

function renderEvoAntiBan(ab) {
  const form = document.getElementById("evoAntiBanForm");
  if (!form || !ab) return;
  form.maxPerHour.value = ab.maxPerHour ?? 60;
  form.maxPerDay.value = ab.maxPerDay ?? 300;
  form.minDelayMs.value = ab.minDelayMs ?? 2000;
  form.maxDelayMs.value = ab.maxDelayMs ?? 8000;
  form.hoursStart.value = ab.hoursStart ?? 8;
  form.hoursEnd.value = ab.hoursEnd ?? 20;
  form.warmupEnabled.checked = ab.warmupEnabled !== false;
  form.blockOptedOut.checked = ab.blockOptedOut !== false;
}

function renderEvoAssignment(assignedIds) {
  const container = document.getElementById("evoAssignmentContainer");
  if (!container) return;

  const users = (state.users || []).filter((u) => u.status === "active");
  if (users.length === 0) { container.style.display = "none"; return; }
  container.style.display = "";

  container.innerHTML = `
    <div class="evo-assignment-panel">
      <div class="evo-assignment-header">
        <strong>Restringir acesso por usuário</strong>
        <span class="evo-assignment-hint">Deixe em branco para todos os usuários do tenant verem as conversas deste número</span>
      </div>
      <div class="evo-assignment-list">
        ${users.map((u) => `
          <label class="evo-assignment-item">
            <input type="checkbox" class="evo-user-check" value="${escapeHtml(u.id)}" ${assignedIds.includes(u.id) ? "checked" : ""}>
            <span class="evo-assignment-name">${escapeHtml(u.name || u.email)}</span>
            <span class="evo-assignment-role">${escapeHtml(u.role?.name || "")}</span>
          </label>
        `).join("")}
      </div>
      <button class="btn btn-sm btn-secondary" id="evoSaveAssignmentBtn" style="margin-top:8px">Salvar atribuição</button>
    </div>
  `;

  document.getElementById("evoSaveAssignmentBtn")?.addEventListener("click", async () => {
    const checked = [...container.querySelectorAll(".evo-user-check:checked")].map((el) => el.value);
    const instanceForm = document.getElementById("evoSettingsForm");
    if (!instanceForm) return;
    try {
      await api("/api/evolution/instance", {
        method: "POST",
        body: JSON.stringify({
          instanceName: instanceForm.instanceName.value,
          apiUrl: instanceForm.apiUrl.value,
          apiKey: instanceForm.apiKey.value || undefined,
          assignedUserIds: checked
        })
      });
      setStatus("Atribuição salva com sucesso");
    } catch (err) {
      setStatus("Erro ao salvar atribuição: " + err.message);
    }
  });
}

function renderEvoWarmup(warmup) {
  const el = document.getElementById("evoWarmupStatus");
  if (!el || !warmup) return;
  if (!warmup.active) {
    el.style.display = "none";
    return;
  }
  el.style.display = "";
  el.innerHTML = `
    <div class="evo-warmup-badge">
      <strong>Aquecimento ativo</strong>
      <span>Dia ${warmup.daysSince + 1} — limite atual: <strong>${warmup.dailyLimit} msgs/dia</strong></span>
      <small>O limite aumenta progressivamente ate o dia 30. Isso protege o numero contra banimento.</small>
    </div>`;
}

function showEvoQr(base64) {
  const panel = document.getElementById("evoQrPanel");
  const img = document.getElementById("evoQrImage");
  if (!panel || !img) return;
  img.src = base64.startsWith("data:") ? base64 : `data:image/png;base64,${base64}`;
  panel.style.display = "";
}

function hideEvoQr() {
  const panel = document.getElementById("evoQrPanel");
  if (panel) panel.style.display = "none";
  stopQrPoll();
}

function startQrPoll() {
  stopQrPoll();
  evoQrPollInterval = setInterval(async () => {
    try {
      const result = await api("/api/evolution/my-instance/status");
      renderEvoStatus({ status: result.status });
      if (result.status === "connected") {
        hideEvoQr();
        setStatus("WhatsApp Chat conectado!");
        setTimeout(() => setStatus("Online"), 4000);
      } else if (result.status === "disconnected") {
        hideEvoQr();
      }
    } catch { /**/ }
  }, 5000);
}

function stopQrPoll() {
  if (evoQrPollInterval) { clearInterval(evoQrPollInterval); evoQrPollInterval = null; }
}

async function loadEvoBanTips() {
  try {
    const result = await api("/api/evolution/tips");
    const list = document.getElementById("evoBanTips");
    if (list && result.data) {
      list.innerHTML = result.data.map((tip) => `<li class="ban-tip-item">${escapeHtml(tip)}</li>`).join("");
    }
  } catch { /**/ }
}

document.getElementById("evoServerForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    await api("/api/evolution/server-config", {
      method: "POST",
      body: JSON.stringify({ apiUrl: form.apiUrl.value.trim(), apiKey: form.apiKey.value.trim() })
    });
    form.apiKey.value = "";
    setStatus("Servidor Evolution salvo");
    await loadEvoServerConfig();
    setTimeout(() => setStatus("Online"), 3000);
  } catch (error) {
    setStatus(`Erro: ${error.message}`);
  }
});

document.getElementById("evoAntiBanForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    await api("/api/evolution/my-instance/anti-ban", {
      method: "POST",
      body: JSON.stringify({
        maxPerHour: Number(form.maxPerHour.value),
        maxPerDay: Number(form.maxPerDay.value),
        minDelayMs: Number(form.minDelayMs.value),
        maxDelayMs: Number(form.maxDelayMs.value),
        hoursStart: Number(form.hoursStart.value),
        hoursEnd: Number(form.hoursEnd.value),
        warmupEnabled: form.warmupEnabled.checked,
        blockOptedOut: form.blockOptedOut.checked
      })
    });
    setStatus("Protecao anti-ban salva");
    setTimeout(() => setStatus("Online"), 3000);
  } catch (error) {
    setStatus(`Erro: ${error.message}`);
  }
});

document.getElementById("evoConnectBtn")?.addEventListener("click", async () => {
  try {
    setStatus("Iniciando conexao...");
    const result = await api("/api/evolution/my-instance/connect", { method: "POST" });
    const nameEl = document.getElementById("evoMyInstanceName");
    if (nameEl && result.instanceName) nameEl.textContent = result.instanceName;
    if (result.qrCode) {
      showEvoQr(result.qrCode);
      startQrPoll();
      renderEvoStatus({ status: "qr_pending" });
      setStatus("Escaneie o QR code com seu WhatsApp");
    } else {
      renderEvoStatus({ status: result.status || "connecting" });
      setStatus("Conectando...");
      startQrPoll();
    }
  } catch (error) {
    setStatus(`Erro ao conectar: ${error.message}`);
  }
});

document.getElementById("evoDisconnectBtn")?.addEventListener("click", async () => {
  if (!confirm("Desconectar o WhatsApp deste numero?")) return;
  try {
    await api("/api/evolution/my-instance/disconnect", { method: "POST" });
    renderEvoStatus({ status: "disconnected" });
    hideEvoQr();
    setStatus("WhatsApp Chat desconectado");
    setTimeout(() => setStatus("Online"), 3000);
  } catch (error) {
    setStatus(`Erro ao desconectar: ${error.message}`);
  }
});

document.getElementById("evoRefreshStatus")?.addEventListener("click", async () => {
  try {
    const result = await api("/api/evolution/my-instance/status");
    renderEvoStatus({ status: result.status });
    setStatus(`Status: ${result.status}`);
    setTimeout(() => setStatus("Online"), 3000);
  } catch (error) {
    setStatus(`Erro: ${error.message}`);
  }
});

// Vendedores
async function renderSellers() {
  const target = document.getElementById("sellersContent");
  if (!target) return;
  target.innerHTML = `<div class="empty-state">Carregando...</div>`;
  try {
    const result = await api("/api/sellers");
    const sellers = result.data || [];
    if (!sellers.length) {
      target.innerHTML = `<div class="empty-state">Nenhum vendedor com negocios encontrado.</div>`;
      return;
    }
    const totalRevenue = sellers.reduce((s, v) => s + v.revenue, 0);
    target.innerHTML = `
      <div class="sellers-grid">
        ${sellers.map((seller, i) => `
          <div class="seller-card">
            <div class="seller-card-header">
              <span class="avatar avatar-${["cyan","amber","rose","purple",""][i % 5]}">${escapeHtml(initials(seller.name))}</span>
              <div>
                <strong>${escapeHtml(seller.name)}</strong>
                <small>${escapeHtml(seller.market || "")}</small>
              </div>
            </div>
            <div class="seller-metrics">
              <div class="seller-metric">
                <span>Total negocios</span>
                <strong>${seller.total}</strong>
              </div>
              <div class="seller-metric">
                <span>Ganhos</span>
                <strong>${seller.won}</strong>
              </div>
              <div class="seller-metric">
                <span>Receita</span>
                <strong>${money.format(seller.revenue)}</strong>
              </div>
              <div class="seller-metric">
                <span>Em aberto</span>
                <strong>${money.format(seller.openAmount)}</strong>
              </div>
              <div class="seller-metric">
                <span>Conversao</span>
                <strong>${seller.conversionRate}%</strong>
              </div>
            </div>
            <div class="seller-revenue-bar">
              <div style="width:${totalRevenue ? Math.max(4, (seller.revenue / totalRevenue) * 100) : 0}%"></div>
            </div>
          </div>
        `).join("")}
      </div>
      <div class="table-footer"><small>${sellers.length} vendedores encontrados</small></div>
    `;
  } catch (error) {
    target.innerHTML = `<div class="empty-state">Erro ao carregar vendedores: ${escapeHtml(error.message)}</div>`;
  }
}

loadAll().then(() => {
  const hash = window.location.hash;
  if (hash) {
    const target = document.querySelector(`nav a[href="${hash}"]`);
    if (target) target.click();
  }
}).catch((error) => {
  console.error(error);
  setStatus("Erro ao carregar");
});
