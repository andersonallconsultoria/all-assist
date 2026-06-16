const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL"
});

const state = {
  currentUser: null,
  context: null,
  dashboard: null,
  contacts: [],
  conversations: [],
  users: [],
  roles: [],
  customers: [],
  support: null,
  contactsFilter: "all",
  usersFilter: "all",
  waTemplates: [],
  waSettings: null,
  tickets: [],
  ticketAnalysts: [],
  activeTicket: null,
  inbox: { tab: "mine", activeId: null, search: "", activeTicket: null }
};

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
    if (link.getAttribute("href") === "#whatsapp-chat") renderWhatsAppChat();
    if (link.getAttribute("href") === "#tickets") renderTickets();
    if (link.getAttribute("href") === "#inbox") renderInbox();
    if (link.getAttribute("href") === "#customers") renderCustomers();
    if (link.getAttribute("href") === "#reports") renderReports();
    if (link.getAttribute("href") === "#kb") renderKb();
  });
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

document.getElementById("themeToggle").addEventListener("click", () => {
  const nextTheme = document.body.dataset.theme === "dark" ? "light" : "dark";
  setTheme(nextTheme);
});

document.getElementById("contactSearch")?.addEventListener("input", renderContactsTable);
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

setupFilterTabs("contactsFilterTabs", (f) => { state.contactsFilter = f; renderContactsTable(); });
setupFilterTabs("usersFilterTabs", (f) => { state.usersFilter = f; renderUsersTable(); });

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
    const vars = buildWaVariables({});
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

function renderContactsTable() {
  const target = document.getElementById("contactTableContent");
  if (!target) return;
  const q = normalizeText(document.getElementById("contactSearch")?.value || "");
  const filter = state.contactsFilter;

  const ticketCountByContact = new Map();
  for (const ticket of state.tickets || []) {
    if (ticket.contactId) {
      ticketCountByContact.set(ticket.contactId, (ticketCountByContact.get(ticket.contactId) || 0) + 1);
    }
  }

  const filtered = state.contacts.filter((c) => {
    const search = normalizeText(`${c.name} ${c.phone} ${c.city} ${c.state} ${c.email}`);
    if (q && !search.includes(q)) return false;
    const tickets = ticketCountByContact.get(c.id) || 0;
    if (filter === "withtickets") return tickets > 0;
    if (filter === "withphone") return Boolean(c.phone);
    return true;
  });

  updateFilterTabCounts("contactsFilterTabs", {
    all: state.contacts.length,
    withtickets: state.contacts.filter((c) => (ticketCountByContact.get(c.id) || 0) > 0).length,
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
          <th>Tickets</th>
          <th>Origem</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${filtered.map((contact, i) => {
          const ticketCount = ticketCountByContact.get(contact.id) || 0;
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
                ${ticketCount > 0
                  ? `<span class="badge badge-success">${ticketCount} ticket${ticketCount > 1 ? "s" : ""}</span>`
                  : `<span class="badge badge-neutral">Sem tickets</span>`}
              </td>
              <td class="cell-muted">${escapeHtml(sourceLabel(contact.source || "manual"))}</td>
              <td style="display:flex;gap:6px;align-items:center">
                <button class="btn btn-sm contact-edit-btn"
                  data-contact-id="${escapeHtml(contact.id)}">Editar</button>
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

  const [dashboard, contacts, conversations, users, roles, tickets, customers, support, waSettings] = await Promise.all([
    api("/api/dashboard").catch(() => null),
    api("/api/contacts"),
    api("/api/conversations"),
    api("/api/users").catch(() => ({ data: [] })),
    api("/api/roles").catch(() => ({ data: [] })),
    hasPermission("tickets:view") ? api("/api/tickets").catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
    hasPermission("contacts:view") ? api("/api/customers").catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
    hasPermission("support:view") ? loadSupportData() : Promise.resolve(null),
    hasPermission("settings:manage") ? api("/api/whatsapp/settings").catch(() => null) : Promise.resolve(null)
  ]);

  state.dashboard = dashboard;
  state.contacts = contacts.data || [];
  state.conversations = conversations.data || [];
  state.users = users.data || [];
  state.roles = roles.data || [];
  state.tickets = tickets.data || [];
  state.customers = customers.data || [];
  state.support = support;
  state.waSettings = waSettings;

  renderCurrentUser();
  renderDashboard();
  renderContactsTable();
  renderConversations();
  renderUsersTable();
  renderSettings();
  renderSupport();
  renderAutomations();
  renderWaTemplatesSection();
  if (document.querySelector("#tickets")) renderTickets();
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
  const d = state.dashboard || {};
  const t = d.tickets || {};
  const c = d.conversations || {};
  const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  const setHtml = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };

  setText("dashTicketsOpen", t.open ?? 0);
  setText("dashTicketsSla", `${t.slaAtRisk ?? 0} perto do SLA`);
  setText("dashTicketsUnassigned", t.unassigned ?? 0);
  setText("dashClosedToday", t.closedToday ?? 0);
  setText("dashAvgResponse", t.avgFirstResponseMins != null ? `${t.avgFirstResponseMins} min` : "—");
  setText("dashConversationsOpen", c.open ?? 0);
  setText("dashUnread", `${c.unread ?? 0} nao lidas`);
  setText("dashContacts", d.contacts?.total ?? 0);

  setHtml("dashByCategory", renderDistribution(t.byCategory, TICKET_CATEGORY_LABELS));
  setHtml("dashByPriority", renderDistribution(t.byPriority, TICKET_PRIORITY_LABELS));
}

function renderDistribution(map, labels) {
  const entries = Object.entries(map || {});
  if (!entries.length) return `<div class="empty-state compact">Sem tickets abertos.</div>`;
  const total = entries.reduce((sum, [, n]) => sum + n, 0);
  return entries
    .sort((a, b) => b[1] - a[1])
    .map(([key, n]) => {
      const pct = total ? Math.round((n / total) * 100) : 0;
      return `<div class="dist-row">
        <span class="dist-label">${escapeHtml(labels[key] || key)}</span>
        <div class="dist-bar"><div style="width:${pct}%"></div></div>
        <strong>${n}</strong>
      </div>`;
    })
    .join("");
}

function renderSummary(targetId, data) {
  const target = document.getElementById(targetId);
  const entries = Object.entries(data || {});
  target.innerHTML = entries.length
    ? entries.map(([name, count]) => `<div class="summary-item"><span>${escapeHtml(name)}</span><strong>${count}</strong></div>`).join("")
    : `<div class="empty-state">Sem dados ainda.</div>`;
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

/* ══════════════════════════════════════
   AUTOMAÇÕES WHATSAPP
══════════════════════════════════════ */
async function renderAutomations() {
  if (!document.getElementById("botEnabled")) return;
  if (!hasPermission("settings:manage")) return;
  try {
    const cfg = await api("/api/bot/config");
    document.getElementById("botEnabled").checked = Boolean(cfg.enabled);
    document.getElementById("botGreeting").value = cfg.greeting || "";
    document.getElementById("botHandoff").value = cfg.handoffMessage || "";
    document.getElementById("botStatus").textContent = cfg.enabled ? "Bot ativo: responde a primeira mensagem automaticamente." : "Bot desativado.";
  } catch (e) {
    document.getElementById("botStatus").textContent = "Erro ao carregar: " + e.message;
  }
}

document.getElementById("botSaveBtn")?.addEventListener("click", async () => {
  const payload = {
    enabled: document.getElementById("botEnabled").checked,
    greeting: document.getElementById("botGreeting").value.trim(),
    handoffMessage: document.getElementById("botHandoff").value.trim()
  };
  try {
    await api("/api/bot/config", { method: "PUT", body: JSON.stringify(payload) });
    document.getElementById("botStatus").textContent = payload.enabled ? "Bot ativo: responde a primeira mensagem automaticamente." : "Bot desativado.";
    setStatus("Configuração do bot salva");
  } catch (e) { setStatus("Erro: " + e.message); }
});

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
    const custSel = document.getElementById("contactEditCustomer");
    if (custSel) {
      custSel.innerHTML = `<option value="">— Sem cliente —</option>` +
        (state.customers || []).map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
      custSel.value = contact.customerId || "";
    }
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
      notes: document.getElementById("contactEditNotes").value.trim(),
      customerId: document.getElementById("contactEditCustomer")?.value || null
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
      renderContactsTable();
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

// ===== Tickets =====
const TICKET_CATEGORY_LABELS = {
  support: "Suporte",
  question: "Dúvida",
  complaint: "Reclamação",
  compliment: "Elogio",
  sales: "Comercial",
  other: "Outro"
};
const TICKET_PRIORITY_LABELS = {
  critical: "Crítica",
  high: "Alta",
  medium: "Média",
  low: "Baixa"
};
const TICKET_PRIORITY_BADGE = {
  critical: "badge-danger",
  high: "badge-warning",
  medium: "badge-info",
  low: "badge-neutral"
};
const TICKET_STATUS_LABELS = {
  open: "Aberto",
  waiting_analyst: "Aguardando Analista",
  waiting_customer: "Aguardando Cliente",
  closed: "Fechado"
};
const TICKET_COLUMNS = [
  { key: "open", label: "Abertos" },
  { key: "waiting_analyst", label: "Aguardando Analista" },
  { key: "waiting_customer", label: "Aguardando Cliente" },
  { key: "closed", label: "Fechados hoje" }
];

function ticketFilterValues() {
  return {
    priority: document.getElementById("ticketFilterPriority")?.value || "",
    category: document.getElementById("ticketFilterCategory")?.value || "",
    assignedAnalystId: document.getElementById("ticketFilterAnalyst")?.value || ""
  };
}

async function loadTicketAnalysts() {
  if (state.ticketAnalysts.length) return;
  try {
    const res = await api("/api/tickets/analysts");
    state.ticketAnalysts = res.data || [];
    const filterSel = document.getElementById("ticketFilterAnalyst");
    const assignSel = document.getElementById("ticketAssignSelect");
    const opts = state.ticketAnalysts.map((a) => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join("");
    if (filterSel) filterSel.innerHTML = `<option value="">Todos analistas</option>${opts}`;
    if (assignSel) assignSel.innerHTML = `<option value="">— Atribuir analista —</option>${opts}`;
  } catch (error) {
    console.error("Falha ao carregar analistas", error);
  }
}

async function renderTickets() {
  const board = document.getElementById("ticketBoard");
  if (!board) return;
  await loadTicketAnalysts();
  const filters = ticketFilterValues();
  const query = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
  try {
    const res = await api(`/api/tickets${query ? "?" + query : ""}`);
    state.tickets = res.data || [];
  } catch (error) {
    board.innerHTML = `<div class="empty-state">Erro ao carregar tickets: ${escapeHtml(error.message)}</div>`;
    return;
  }
  renderTicketBoard();
  updateTicketBadge();
}

function updateTicketBadge() {
  const openCount = state.tickets.filter((t) => t.status !== "closed").length;
  const badge = document.getElementById("ticketBadge");
  if (badge) {
    badge.textContent = openCount;
    badge.style.display = openCount > 0 ? "" : "none";
  }
  const counter = document.getElementById("ticketCount");
  if (counter) counter.textContent = `${openCount} aberto${openCount === 1 ? "" : "s"}`;
}

function renderTicketBoard() {
  const board = document.getElementById("ticketBoard");
  if (!board) return;
  board.innerHTML = TICKET_COLUMNS.map((col) => {
    const items = state.tickets.filter((t) => t.status === col.key);
    const cards = items.length
      ? items.map(ticketCardHtml).join("")
      : `<div class="kanban-empty">Nenhum ticket</div>`;
    return `
      <div class="kanban-column">
        <div class="kanban-column-header">
          <strong>${col.label}</strong>
          <span class="kanban-count">${items.length}</span>
        </div>
        <div class="kanban-cards">${cards}</div>
      </div>
    `;
  }).join("");
  board.querySelectorAll("[data-ticket-id]").forEach((el) => {
    el.addEventListener("click", () => openTicket(el.dataset.ticketId));
  });
}

function ticketTimeOpen(openedAt) {
  if (!openedAt) return "";
  const diffMs = Date.now() - new Date(openedAt).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function ticketCardHtml(ticket) {
  const priorityBadge = TICKET_PRIORITY_BADGE[ticket.priority] || "badge-neutral";
  const analyst = ticket.analystName
    ? `<span class="ticket-card-analyst" title="Analista">${escapeHtml(ticket.analystName)}</span>`
    : `<span class="ticket-card-analyst unassigned">Não atribuído</span>`;
  return `
    <div class="ticket-card" data-ticket-id="${ticket.id}">
      <div class="ticket-card-top">
        <span class="avatar-mini">${escapeHtml(initials(ticket.contactName))}</span>
        <div class="ticket-card-id">
          <strong>${escapeHtml(ticket.contactName)}</strong>
          <small>${escapeHtml(TICKET_CATEGORY_LABELS[ticket.category] || ticket.category)}</small>
        </div>
        <span class="badge ${priorityBadge}">${escapeHtml(TICKET_PRIORITY_LABELS[ticket.priority] || ticket.priority)}</span>
      </div>
      <p class="ticket-card-subject">${escapeHtml(ticket.subject || "")}</p>
      <div class="ticket-card-footer">
        ${analyst}
        <span class="ticket-card-time" title="Aberto há">⏱ ${ticketTimeOpen(ticket.openedAt)}</span>
      </div>
    </div>
  `;
}

async function openTicket(id) {
  const overlay = document.getElementById("ticketOverlay");
  if (!overlay) return;
  overlay.classList.remove("hidden");
  document.getElementById("ticketChat").innerHTML = `<div class="empty-state">Carregando...</div>`;
  try {
    const ticket = await api(`/api/tickets/${id}`);
    state.activeTicket = ticket;
    renderTicketDrawer(ticket);
  } catch (error) {
    document.getElementById("ticketChat").innerHTML = `<div class="empty-state">Erro: ${escapeHtml(error.message)}</div>`;
  }
}

function renderTicketDrawer(ticket) {
  document.getElementById("ticketDrawerCategory").textContent = TICKET_CATEGORY_LABELS[ticket.category] || ticket.category;
  document.getElementById("ticketDrawerSubject").textContent = ticket.subject || "Ticket";
  document.getElementById("ticketDrawerContact").textContent = `${ticket.contactName}${ticket.contactPhone ? " · " + ticket.contactPhone : ""}`;

  const ai = ticket.aiClassification;
  document.getElementById("ticketDrawerMeta").innerHTML = `
    <span class="badge ${TICKET_PRIORITY_BADGE[ticket.priority] || "badge-neutral"}">${TICKET_PRIORITY_LABELS[ticket.priority] || ticket.priority}</span>
    <span class="badge badge-neutral">${TICKET_STATUS_LABELS[ticket.status] || ticket.status}</span>
    ${ticket.analystName ? `<span class="badge badge-info">${escapeHtml(ticket.analystName)}</span>` : ""}
    ${ai ? `<span class="ticket-ai-note" title="${escapeHtml(ai.reasoning || "")}">🤖 IA ${Math.round((ai.confidence || 0) * 100)}%</span>` : ""}
  `;

  // Select de atribuição reflete o analista atual
  const assignSel = document.getElementById("ticketAssignSelect");
  if (assignSel) assignSel.value = ticket.assignedAnalystId || "";

  // Botões de status
  const statusBtns = document.getElementById("ticketStatusButtons");
  if (statusBtns) {
    statusBtns.innerHTML = ["open", "waiting_customer", "waiting_analyst"].map((s) => `
      <button class="btn btn-secondary ticket-status-btn ${ticket.status === s ? "active" : ""}" data-status="${s}">
        ${TICKET_STATUS_LABELS[s]}
      </button>
    `).join("");
    statusBtns.querySelectorAll("[data-status]").forEach((btn) => {
      btn.addEventListener("click", () => changeTicketStatus(ticket.id, btn.dataset.status));
    });
  }

  // Botão fechar e reply visíveis só se não estiver fechado
  const isClosed = ticket.status === "closed";
  document.getElementById("ticketCloseBtn").style.display = isClosed ? "none" : "";
  document.getElementById("ticketReplyBox").style.display = isClosed ? "none" : "";

  // Chat
  const messages = ticket.conversation?.messages || [];
  const chat = document.getElementById("ticketChat");
  chat.innerHTML = messages.length
    ? messages.map((m) => `
        <div class="message ${m.direction}">
          <p>${escapeHtml(m.body)}</p>
          <div class="msg-meta">
            <small>${formatDateTime(m.createdAt)}</small>
            ${m.direction === "outbound" ? renderMsgStatus(m.status) : ""}
          </div>
        </div>
      `).join("")
    : `<div class="empty-state">Sem mensagens nesta conversa.</div>`;
  chat.scrollTop = chat.scrollHeight;
}

function closeTicketDrawer() {
  document.getElementById("ticketOverlay")?.classList.add("hidden");
  state.activeTicket = null;
}

async function ticketAction(path, body, successMsg) {
  try {
    await api(path, { method: "POST", body: JSON.stringify(body || {}) });
    if (successMsg) setStatus(successMsg);
    if (state.activeTicket) await openTicket(state.activeTicket.id);
    await renderTickets();
  } catch (error) {
    setStatus(`Erro: ${error.message}`);
  }
}

async function assignTicket(id, analystId) {
  await ticketAction(`/api/tickets/${id}/assign`, { analystId }, "Ticket atribuído");
}

async function changeTicketStatus(id, status) {
  await ticketAction(`/api/tickets/${id}/status`, { status }, "Status atualizado");
}

async function replyTicket() {
  const ticket = state.activeTicket;
  if (!ticket) return;
  const input = document.getElementById("ticketReplyText");
  const body = input.value.trim();
  if (!body) return;
  input.value = "";
  await ticketAction(`/api/tickets/${ticket.id}/messages`, { body }, "Mensagem enviada");
}

async function closeActiveTicket() {
  const ticket = state.activeTicket;
  if (!ticket) return;
  const note = window.prompt("Nota de encerramento (opcional):", "") ?? "";
  await ticketAction(`/api/tickets/${ticket.id}/close`, { closureNote: note }, "Ticket fechado");
}

function wireTicketEvents() {
  document.getElementById("ticketRefreshBtn")?.addEventListener("click", () => renderTickets());
  ["ticketFilterPriority", "ticketFilterCategory", "ticketFilterAnalyst"].forEach((id) => {
    document.getElementById(id)?.addEventListener("change", () => renderTickets());
  });
  document.getElementById("ticketDrawerClose")?.addEventListener("click", closeTicketDrawer);
  document.getElementById("ticketOverlay")?.addEventListener("click", (e) => {
    if (e.target.id === "ticketOverlay") closeTicketDrawer();
  });
  document.getElementById("ticketCloseBtn")?.addEventListener("click", closeActiveTicket);
  document.getElementById("ticketReplyBtn")?.addEventListener("click", replyTicket);
  document.getElementById("ticketReplyText")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      replyTicket();
    }
  });
  document.getElementById("ticketAssignSelect")?.addEventListener("change", (e) => {
    if (state.activeTicket) assignTicket(state.activeTicket.id, e.target.value || null);
  });
}

wireTicketEvents();

// ===== Clientes (empresas) =====
const ATIVIDADE_LABELS = {
  comercio: "Comércio",
  atacado: "Atacado",
  comercio_atacado: "Comércio/Atacado",
  deposito: "Depósito",
  industria: "Indústria",
  servicos: "Serviços",
  outro: "Outro"
};

function renderCustomers() {
  const target = document.getElementById("customersContent");
  if (!target) return;
  const q = normalizeText(document.getElementById("customerSearch")?.value || "");
  const items = (state.customers || []).filter((c) => !q || normalizeText(`${c.name} ${c.document}`).includes(q));
  if (!items.length) {
    target.innerHTML = `<div class="empty-state">Nenhum cliente cadastrado. Clique em "+ Novo cliente" para começar.</div>`;
    return;
  }
  target.innerHTML = `
    <table class="data-table">
      <thead><tr><th>Cliente</th><th>CNPJ</th><th>UF</th><th>Atividade</th><th>Contatos</th><th>Horas</th><th>Cobrança</th><th></th></tr></thead>
      <tbody>
        ${items.map((c) => `
          <tr>
            <td><div class="table-name-cell"><span class="table-avatar">${escapeHtml(initials(c.fantasia || c.name))}</span><div><strong>${escapeHtml(c.fantasia || c.name)}</strong><small>${escapeHtml(c.fantasia ? c.name : "")}</small></div></div></td>
            <td class="cell-muted">${escapeHtml(c.cnpj || "—")}</td>
            <td class="cell-muted">${escapeHtml(c.uf || "—")}</td>
            <td class="cell-muted">${escapeHtml(ATIVIDADE_LABELS[c.atividade] || c.atividade || "—")}</td>
            <td class="cell-muted">${c.contactsCount || 0}</td>
            <td><strong>${formatDuration(c.totalSeconds || 0)}</strong>${c.openTicketsCount ? ` <span class="badge badge-warning">${c.openTicketsCount}</span>` : ""}</td>
            <td>${c.hourlyBilling ? `<span class="badge badge-success">Por horas</span>` : `<span class="badge badge-neutral">—</span>`}</td>
            <td style="display:flex;gap:6px">
              <button class="btn btn-sm customer-vault-btn" data-customer-id="${escapeHtml(c.id)}" data-customer-name="${escapeHtml(c.fantasia || c.name)}">🔑 Acessos</button>
              <button class="btn btn-sm customer-edit-btn" data-customer-id="${escapeHtml(c.id)}">Editar</button>
            </td>
          </tr>`).join("")}
      </tbody>
    </table>
    <div class="table-footer"><small>${items.length} cliente(s)</small></div>`;
  target.querySelectorAll(".customer-edit-btn").forEach((b) =>
    b.addEventListener("click", () => openCustomerModal((state.customers || []).find((c) => c.id === b.dataset.customerId)))
  );
  target.querySelectorAll(".customer-vault-btn").forEach((b) =>
    b.addEventListener("click", () => openVault(b.dataset.customerId, b.dataset.customerName))
  );
}

(function setupCustomerModal() {
  const overlay = document.getElementById("customerOverlay");
  if (!overlay) return;
  let activeId = null;
  const $ = (id) => document.getElementById(id);
  window.openCustomerModal = (customer) => {
    activeId = customer?.id || null;
    $("customerModalTitle").textContent = customer ? "Editar cliente" : "Novo cliente";
    $("customerName").value = customer?.name || "";
    $("customerFantasia").value = customer?.fantasia || "";
    $("customerCnpj").value = customer?.cnpj || "";
    $("customerIe").value = customer?.ie || "";
    $("customerUf").value = customer?.uf || "";
    $("customerRegime").value = customer?.regime || "";
    $("customerAtividade").value = customer?.atividade || "";
    $("customerMatrizFilial").value = customer?.matrizFilial || "matriz";
    $("customerBlocoK").checked = Boolean(customer?.blocoK);
    $("customerHourly").checked = Boolean(customer?.hourlyBilling);
    $("customerNotes").value = customer?.notes || "";
    $("customerModalError").style.display = "none";
    overlay.style.display = "flex";
  };
  const close = () => { overlay.style.display = "none"; activeId = null; };
  $("customerCancel").addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  $("newCustomerBtn")?.addEventListener("click", () => window.openCustomerModal(null));
  $("customerSave").addEventListener("click", async () => {
    const name = $("customerName").value.trim();
    const err = $("customerModalError");
    if (!name) { err.textContent = "Nome é obrigatório."; err.style.display = ""; return; }
    const payload = {
      name,
      fantasia: $("customerFantasia").value.trim(),
      cnpj: $("customerCnpj").value.trim(),
      ie: $("customerIe").value.trim(),
      uf: $("customerUf").value.trim(),
      regime: $("customerRegime").value,
      atividade: $("customerAtividade").value,
      matrizFilial: $("customerMatrizFilial").value,
      blocoK: $("customerBlocoK").checked,
      hourlyBilling: $("customerHourly").checked,
      notes: $("customerNotes").value.trim()
    };
    try {
      if (activeId) await api(`/api/customers/${activeId}`, { method: "PATCH", body: JSON.stringify(payload) });
      else await api("/api/customers", { method: "POST", body: JSON.stringify(payload) });
      const res = await api("/api/customers").catch(() => ({ data: [] }));
      state.customers = res.data || [];
      close();
      renderCustomers();
      setStatus("Cliente salvo");
    } catch (error) { err.textContent = error.message; err.style.display = ""; }
  });
})();

// ===== Base de conhecimento =====
let kbList = [];

async function renderKb() {
  const target = document.getElementById("kbContent");
  if (!target) return;
  const q = document.getElementById("kbSearch")?.value || "";
  try {
    const res = await api(`/api/kb${q ? "?q=" + encodeURIComponent(q) : ""}`);
    kbList = res.data || [];
  } catch (e) {
    target.innerHTML = `<div class="empty-state">Erro: ${escapeHtml(e.message)}</div>`;
    return;
  }
  if (!kbList.length) {
    target.innerHTML = `<div class="empty-state">${q ? "Nenhum artigo encontrado." : 'Nenhum artigo ainda. Clique em "+ Novo artigo".'}</div>`;
    return;
  }
  target.innerHTML = `<div class="kb-grid">${kbList.map((a) => `
    <article class="kb-card" data-kb-id="${a.id}">
      <div class="kb-card-head">
        <strong>${escapeHtml(a.title)}</strong>
        ${a.category ? `<span class="badge badge-info">${escapeHtml(a.category)}</span>` : ""}
      </div>
      <p class="kb-card-excerpt">${escapeHtml((a.content || "").slice(0, 160))}${(a.content || "").length > 160 ? "…" : ""}</p>
      <div class="kb-card-tags">${(a.tags || []).map((t) => `<span class="kb-tag">#${escapeHtml(t)}</span>`).join("")}</div>
    </article>`).join("")}</div>`;
  target.querySelectorAll("[data-kb-id]").forEach((el) => el.addEventListener("click", () => openKbModal(kbList.find((a) => a.id === el.dataset.kbId))));
}

(function setupKbModal() {
  const overlay = document.getElementById("kbOverlay");
  if (!overlay) return;
  let activeId = null;
  const $ = (id) => document.getElementById(id);
  window.openKbModal = (article) => {
    activeId = article?.id || null;
    const canManage = hasPermission("kb:manage");
    $("kbModalTitle").textContent = article ? (canManage ? "Editar artigo" : article.title) : "Novo artigo";
    $("kbTitle").value = article?.title || "";
    $("kbCategory").value = article?.category || "";
    $("kbTags").value = (article?.tags || []).join(", ");
    $("kbBody").value = article?.content || "";
    [$("kbTitle"), $("kbCategory"), $("kbTags"), $("kbBody")].forEach((i) => { i.readOnly = !canManage; });
    $("kbSave").style.display = canManage ? "" : "none";
    $("kbModalError").style.display = "none";
    renderKbAttachments(article);
    overlay.style.display = "flex";
  };
  window._kbActiveId = () => activeId;
  const close = () => { overlay.style.display = "none"; activeId = null; };
  $("kbCancel").addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  $("newKbBtn")?.addEventListener("click", () => window.openKbModal(null));
  $("kbSave").addEventListener("click", async () => {
    const title = $("kbTitle").value.trim();
    const err = $("kbModalError");
    if (!title) { err.textContent = "Título é obrigatório."; err.style.display = ""; return; }
    const payload = { title, category: $("kbCategory").value.trim(), tags: $("kbTags").value, content: $("kbBody").value };
    try {
      if (activeId) await api(`/api/kb/${activeId}`, { method: "PATCH", body: JSON.stringify(payload) });
      else await api("/api/kb", { method: "POST", body: JSON.stringify(payload) });
      close();
      renderKb();
      setStatus("Artigo salvo");
    } catch (e) { err.textContent = e.message; err.style.display = ""; }
  });
})();

function renderKbAttachments(article) {
  const area = document.getElementById("kbAttachmentsArea");
  if (!area) return;
  if (!article || !article.id) {
    area.innerHTML = `<small class="cell-muted">💾 Salve o artigo primeiro para anexar arquivos (PDF, TXT, vídeos...).</small>`;
    return;
  }
  const canManage = hasPermission("kb:manage");
  const atts = article.attachments || [];
  area.innerHTML = `
    <div class="kb-att-title">Anexos</div>
    <div class="kb-att-list">
      ${atts.length ? atts.map((a) => `
        <div class="kb-att-item">
          <a href="/api/kb/files/${a.id}" target="_blank" rel="noopener">📎 ${escapeHtml(a.name)}</a>
          <span class="cell-muted">${formatBytes(a.size)}</span>
          ${canManage ? `<button class="btn btn-sm" data-kb-delfile="${a.id}" title="Remover">×</button>` : ""}
        </div>`).join("") : `<small class="cell-muted">Nenhum anexo ainda.</small>`}
    </div>
    ${canManage ? `<label class="btn btn-sm" style="margin-top:8px;display:inline-block">+ Anexar arquivo<input type="file" id="kbFileInput" style="display:none"></label>` : ""}`;
  area.querySelectorAll("[data-kb-delfile]").forEach((b) => b.addEventListener("click", () => deleteKbFile(article.id, b.dataset.kbDelfile)));
  document.getElementById("kbFileInput")?.addEventListener("change", (e) => uploadKbFile(article.id, e.target.files[0]));
}

async function uploadKbFile(articleId, file) {
  if (!file) return;
  if (file.size > 30 * 1024 * 1024) { setStatus("Arquivo muito grande (máx 30MB)"); return; }
  setStatus("Enviando arquivo...");
  try {
    const dataBase64 = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(",")[1]);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
    await api(`/api/kb/${articleId}/files`, { method: "POST", body: JSON.stringify({ name: file.name, mime: file.type, dataBase64 }) });
    setStatus("Arquivo anexado");
    await reopenKbArticle(articleId);
  } catch (e) { setStatus(`Erro: ${e.message}`); }
}

async function deleteKbFile(articleId, fileId) {
  if (!window.confirm("Remover este anexo?")) return;
  try { await api(`/api/kb/files/${fileId}`, { method: "DELETE" }); await reopenKbArticle(articleId); }
  catch (e) { setStatus(`Erro: ${e.message}`); }
}

async function reopenKbArticle(articleId) {
  const res = await api("/api/kb").catch(() => ({ data: [] }));
  kbList = res.data || [];
  const a = kbList.find((x) => x.id === articleId);
  if (a) window.openKbModal(a);
  renderKb();
}

function formatBytes(n) {
  if (!n) return "";
  if (n < 1024) return n + " B";
  if (n < 1048576) return (n / 1024).toFixed(0) + " KB";
  return (n / 1048576).toFixed(1) + " MB";
}

document.getElementById("kbSearch")?.addEventListener("input", () => renderKb());

// ===== Relatório de horas =====
function hoursLabel(seconds) {
  const h = Math.floor((seconds || 0) / 3600);
  const m = Math.floor(((seconds || 0) % 3600) / 60);
  return `${h}h${m > 0 ? ` ${m}min` : ""}`;
}

async function renderReports() {
  const from = document.getElementById("reportFrom")?.value || "";
  const to = document.getElementById("reportTo")?.value || "";
  const q = new URLSearchParams();
  if (from) q.set("from", from);
  if (to) q.set("to", to);
  let data;
  try {
    data = await api(`/api/reports/hours${q.toString() ? "?" + q : ""}`);
  } catch (e) {
    document.getElementById("reportByCustomer").innerHTML = `<div class="empty-state">Erro: ${escapeHtml(e.message)}</div>`;
    return;
  }
  document.getElementById("reportTotalHours").textContent = hoursLabel(data.totalSeconds);

  const tableHtml = (rows, nameLabel, extra) => rows.length ? `
    <table class="data-table">
      <thead><tr><th>${nameLabel}</th><th>Atendimentos</th><th>Horas</th>${extra ? "<th></th>" : ""}</tr></thead>
      <tbody>
        ${rows.map((r) => `<tr>
          <td><strong>${escapeHtml(r.name)}</strong></td>
          <td class="cell-muted">${r.tickets}</td>
          <td><strong>${hoursLabel(r.seconds)}</strong></td>
          ${extra ? `<td>${r.hourlyBilling ? '<span class="badge badge-success">Por horas</span>' : ''}</td>` : ""}
        </tr>`).join("")}
      </tbody>
    </table>` : `<div class="empty-state compact">Sem horas no período.</div>`;

  document.getElementById("reportByCustomer").innerHTML = tableHtml(data.byCustomer, "Cliente", true);
  document.getElementById("reportByAnalyst").innerHTML = tableHtml(data.byAnalyst, "Analista", false);
}

document.getElementById("reportApply")?.addEventListener("click", renderReports);

// ===== Cofre de acessos (credenciais por cliente) =====
const vaultState = { customerId: null, customerName: "", list: [] };
const VAULT_TYPE_LABELS = {
  database: "Banco de dados", server: "Servidor", erp: "ERP", ftp: "FTP", api: "API", other: "Outro",
  rdp: "RDP", teamviewer: "TeamViewer", anydesk: "AnyDesk", vnc: "VNC", ssh: "SSH"
};
const VAULT_ACCESS_TYPES = ["database", "server", "erp", "ftp", "api", "other"];
const VAULT_CONNECTION_TYPES = ["rdp", "teamviewer", "anydesk", "vnc", "ssh", "other"];

async function openVault(customerId, customerName) {
  if (!customerId) { setStatus("Vincule o contato a um cliente primeiro"); return; }
  vaultState.customerId = customerId;
  vaultState.customerName = customerName || "Cliente";
  document.getElementById("vaultCustomerName").textContent = vaultState.customerName;
  document.getElementById("vaultOverlay").style.display = "flex";
  document.getElementById("vaultList").innerHTML = `<div class="inbox-empty small"><p>Carregando...</p></div>`;
  document.getElementById("vaultFooter").innerHTML = "";
  await loadVaultList();
}

function closeVault() { document.getElementById("vaultOverlay").style.display = "none"; }

async function loadVaultList() {
  try {
    const res = await api(`/api/customers/${vaultState.customerId}/credentials`);
    vaultState.list = res.data || [];
  } catch { vaultState.list = []; }
  renderVaultList();
  renderVaultFooter();
}

function vaultItemHtml(c) {
  return `
    <div class="vault-item">
      <div class="vault-item-head">
        <div><strong>${escapeHtml(c.label)}</strong><small>${escapeHtml(VAULT_TYPE_LABELS[c.type] || c.type || "Acesso")}</small></div>
        <div class="vault-item-actions">
          <button class="btn btn-sm" data-vault-reveal="${c.id}">Abrir</button>
          ${hasPermission("vault:manage") ? `<button class="btn btn-sm" data-vault-del="${c.id}">Excluir</button>` : ""}
        </div>
      </div>
      <div class="vault-item-detail" id="vaultDetail-${c.id}"></div>
    </div>`;
}

function renderVaultList() {
  const el = document.getElementById("vaultList");
  if (!vaultState.list.length) {
    el.innerHTML = `<div class="inbox-empty small"><p>Nada cadastrado para este cliente ainda.</p></div>`;
    return;
  }
  const acessos = vaultState.list.filter((c) => (c.category || "access") === "access");
  const conexoes = vaultState.list.filter((c) => c.category === "connection");
  const section = (titulo, itens) => itens.length
    ? `<div class="vault-group-title">${titulo}</div>${itens.map(vaultItemHtml).join("")}`
    : "";
  el.innerHTML = section("🔑 Acessos", acessos) + section("🖥️ Conexões remotas", conexoes);
  el.querySelectorAll("[data-vault-reveal]").forEach((b) => b.addEventListener("click", () => revealVaultCred(b.dataset.vaultReveal)));
  el.querySelectorAll("[data-vault-del]").forEach((b) => b.addEventListener("click", () => deleteVaultCred(b.dataset.vaultDel)));
}

async function revealVaultCred(id) {
  const detail = document.getElementById(`vaultDetail-${id}`);
  if (detail.dataset.open === "1") { detail.innerHTML = ""; detail.dataset.open = "0"; return; }
  detail.innerHTML = "Carregando...";
  try {
    const c = await api(`/api/credentials/${id}/reveal`);
    const rows = [["ID/Endereço", c.accessId], ["Host", c.host], ["Porta", c.port], ["Banco", c.database], ["Usuário", c.username], ["Senha", c.password], ["URL", c.url], ["Notas", c.notes]].filter(([, v]) => v);
    detail.innerHTML = rows.length ? rows.map(([k, v]) => `
      <div class="vault-field">
        <span class="vault-field-label">${k}</span>
        <code class="vault-field-value">${escapeHtml(v)}</code>
        <button class="btn btn-sm vault-copy" data-copy="${escapeHtml(v)}">Copiar</button>
      </div>`).join("") : `<small class="cell-muted">Sem dados de conexão.</small>`;
    detail.dataset.open = "1";
    detail.querySelectorAll("[data-copy]").forEach((b) => b.addEventListener("click", () => {
      navigator.clipboard?.writeText(b.dataset.copy);
      setStatus("Copiado para a área de transferência");
      setTimeout(() => setStatus("Online"), 1500);
    }));
  } catch (e) {
    detail.innerHTML = `<span style="color:var(--rose)">Erro: ${escapeHtml(e.message)}</span>`;
  }
}

function renderVaultFooter() {
  const el = document.getElementById("vaultFooter");
  if (!hasPermission("vault:manage")) { el.innerHTML = `<small class="cell-muted">Acesso somente leitura</small>`; return; }
  el.innerHTML = `<button class="btn btn-primary" id="vaultAddBtn" type="button">+ Nova credencial</button>`;
  document.getElementById("vaultAddBtn").addEventListener("click", showVaultForm);
}

function vaultTypeOptions(category) {
  const list = category === "connection" ? VAULT_CONNECTION_TYPES : VAULT_ACCESS_TYPES;
  return list.map((k) => `<option value="${k}">${VAULT_TYPE_LABELS[k]}</option>`).join("");
}

function showVaultForm() {
  const el = document.getElementById("vaultFooter");
  el.innerHTML = `
    <div class="vault-form">
      <select id="vfCategory" class="search-input">
        <option value="access">🔑 Acesso (credencial / banco)</option>
        <option value="connection">🖥️ Conexão remota (RDP, TeamViewer, AnyDesk)</option>
      </select>
      <input id="vfLabel" class="search-input" placeholder="Rótulo (ex: Banco de produção) *">
      <select id="vfType" class="search-input">${vaultTypeOptions("access")}</select>
      <input id="vfAccessId" class="search-input vf-id" placeholder="ID / Endereço (TeamViewer, AnyDesk)">
      <input id="vfHost" class="search-input vf-net" placeholder="Host / IP">
      <input id="vfPort" class="search-input vf-net" placeholder="Porta">
      <input id="vfUsername" class="search-input vf-user" placeholder="Usuário">
      <input id="vfPassword" class="search-input" placeholder="Senha">
      <textarea id="vfNotes" class="search-input" rows="2" placeholder="Notas (opcional)"></textarea>
      <div class="vault-form-actions">
        <button class="btn btn-secondary" id="vfCancel" type="button">Cancelar</button>
        <button class="btn btn-primary" id="vfSave" type="button">Salvar</button>
      </div>
    </div>`;
  const catSel = document.getElementById("vfCategory");
  const typeSel = document.getElementById("vfType");
  const show = (sel, on) => el.querySelectorAll(sel).forEach((f) => { f.style.display = on ? "" : "none"; });
  const applyVisibility = () => {
    const isConn = catSel.value === "connection";
    const type = typeSel.value;
    // ID+senha para TeamViewer/AnyDesk; host/porta/usuário para RDP/VNC/SSH/outro.
    const idOnly = isConn && (type === "teamviewer" || type === "anydesk");
    const netType = isConn && !idOnly;
    show(".vf-id", idOnly);
    show(".vf-net", netType);
    show(".vf-user", netType); // acesso (banco) usa usuário/senha; mostra também
    if (!isConn) show(".vf-user", true); // acesso pede usuário e senha
  };
  const refreshTypes = () => { typeSel.innerHTML = vaultTypeOptions(catSel.value); applyVisibility(); };
  catSel.addEventListener("change", refreshTypes);
  typeSel.addEventListener("change", applyVisibility);
  applyVisibility();
  document.getElementById("vfCancel").addEventListener("click", renderVaultFooter);
  document.getElementById("vfSave").addEventListener("click", saveVaultCred);
}

async function saveVaultCred() {
  const g = (id) => document.getElementById(id).value.trim();
  if (!g("vfLabel")) { setStatus("Informe o rótulo"); return; }
  const isConn = document.getElementById("vfCategory").value === "connection";
  const payload = {
    category: isConn ? "connection" : "access",
    label: g("vfLabel"),
    type: document.getElementById("vfType").value,
    username: g("vfUsername"),
    password: g("vfPassword"),
    notes: g("vfNotes"),
    // dados de rede apenas para conexões remotas
    accessId: isConn ? g("vfAccessId") : "",
    host: isConn ? g("vfHost") : "",
    port: isConn ? g("vfPort") : ""
  };
  try {
    await api(`/api/customers/${vaultState.customerId}/credentials`, { method: "POST", body: JSON.stringify(payload) });
    setStatus("Acesso salvo");
    await loadVaultList();
  } catch (e) { setStatus(`Erro: ${e.message}`); }
}

async function deleteVaultCred(id) {
  if (!window.confirm("Excluir este acesso?")) return;
  try { await api(`/api/credentials/${id}`, { method: "DELETE" }); await loadVaultList(); }
  catch (e) { setStatus(`Erro: ${e.message}`); }
}

document.getElementById("vaultClose")?.addEventListener("click", closeVault);
document.getElementById("vaultOverlay")?.addEventListener("click", (e) => { if (e.target.id === "vaultOverlay") closeVault(); });

// ===== Central de Atendimento (inbox) =====
const QUICK_REPLIES = [
  "Olá! Sou do atendimento, como posso ajudar?",
  "Um momento, por favor — já estou verificando.",
  "Obrigado pelo contato! Posso ajudar em mais alguma coisa?",
  "Registrei seu atendimento, retornaremos em breve."
];

function inboxFilteredTickets() {
  const { tab, search } = state.inbox;
  const priority = document.getElementById("inboxPriority")?.value || "";
  const category = document.getElementById("inboxCategory")?.value || "";
  const myId = state.currentUser?.id;
  const q = normalizeText(search || "");

  return (state.tickets || [])
    .filter((t) => t.status !== "closed")
    .filter((t) => {
      if (tab === "mine") return t.assignedAnalystId === myId;
      if (tab === "unassigned") return !t.assignedAnalystId;
      return true;
    })
    .filter((t) => !priority || t.priority === priority)
    .filter((t) => !category || t.category === category)
    .filter((t) => !q || normalizeText(`${t.contactName} ${t.contactPhone} ${t.subject}`).includes(q))
    .sort((a, b) => {
      const order = { critical: 0, high: 1, medium: 2, low: 3 };
      const d = (order[a.priority] ?? 9) - (order[b.priority] ?? 9);
      return d !== 0 ? d : new Date(b.openedAt) - new Date(a.openedAt);
    });
}

async function renderInbox() {
  const queue = document.getElementById("inboxQueue");
  if (!queue) return;
  await loadTicketAnalysts();
  try {
    const res = await api("/api/tickets");
    state.tickets = res.data || [];
  } catch (error) {
    queue.innerHTML = `<div class="inbox-empty small">Erro ao carregar: ${escapeHtml(error.message)}</div>`;
    return;
  }
  renderInboxQueue();
  updateInboxBadge();
}

function updateInboxBadge() {
  const myId = state.currentUser?.id;
  const mine = (state.tickets || []).filter((t) => t.status !== "closed" && t.assignedAnalystId === myId).length;
  const badge = document.getElementById("inboxBadge");
  if (badge) { badge.textContent = mine; badge.style.display = mine > 0 ? "" : "none"; }
}

function renderInboxQueue() {
  const queue = document.getElementById("inboxQueue");
  if (!queue) return;
  // contadores nas abas
  const myId = state.currentUser?.id;
  const open = (state.tickets || []).filter((t) => t.status !== "closed");
  const counts = {
    mine: open.filter((t) => t.assignedAnalystId === myId).length,
    unassigned: open.filter((t) => !t.assignedAnalystId).length,
    all: open.length
  };
  document.querySelectorAll(".inbox-tab").forEach((tab) => {
    const k = tab.dataset.inboxTab;
    const base = { mine: "Meus", unassigned: "Novos", all: "Todos" }[k];
    tab.textContent = `${base} ${counts[k] ? `(${counts[k]})` : ""}`.trim();
    tab.classList.toggle("active", k === state.inbox.tab);
  });

  const items = inboxFilteredTickets();
  if (!items.length) {
    queue.innerHTML = `<div class="inbox-empty small"><p>Nenhum atendimento nesta fila.</p></div>`;
    return;
  }
  queue.innerHTML = items.map(inboxQueueItemHtml).join("");
  queue.querySelectorAll("[data-inbox-id]").forEach((el) => {
    el.classList.toggle("active", el.dataset.inboxId === state.inbox.activeId);
    el.addEventListener("click", () => selectInboxTicket(el.dataset.inboxId));
  });
}

function inboxQueueItemHtml(t) {
  const prio = TICKET_PRIORITY_BADGE[t.priority] || "badge-neutral";
  return `
    <div class="inbox-queue-item" data-inbox-id="${t.id}">
      <span class="avatar-mini">${escapeHtml(initials(t.contactName))}</span>
      <div class="iqi-body">
        <div class="iqi-top">
          <strong>${escapeHtml(t.contactName)}</strong>
          <span class="iqi-time">${ticketTimeOpen(t.openedAt)}</span>
        </div>
        <div class="iqi-sub">${escapeHtml(t.subject || "")}</div>
        <div class="iqi-tags">
          <span class="badge ${prio}">${escapeHtml(TICKET_PRIORITY_LABELS[t.priority] || t.priority)}</span>
          <span class="badge badge-neutral">${escapeHtml(TICKET_CATEGORY_LABELS[t.category] || t.category)}</span>
          ${!t.assignedAnalystId ? `<span class="badge badge-warning">novo</span>` : ""}
        </div>
      </div>
    </div>`;
}

async function selectInboxTicket(id) {
  state.inbox.activeId = id;
  renderInboxQueue();
  document.getElementById("inboxChat").innerHTML = `<div class="inbox-empty small"><p>Carregando...</p></div>`;
  document.getElementById("inboxChatHeader").hidden = true;
  document.getElementById("inboxReplyBox").hidden = true;
  try {
    const ticket = await api(`/api/tickets/${id}`);
    state.inbox.activeTicket = ticket;
    renderInboxHeader(ticket);
    renderInboxChat(ticket);
    renderInboxContext(ticket);
  } catch (error) {
    document.getElementById("inboxChat").innerHTML = `<div class="inbox-empty small"><p>Erro: ${escapeHtml(error.message)}</p></div>`;
  }
}

function renderInboxHeader(ticket) {
  const header = document.getElementById("inboxChatHeader");
  header.hidden = false;
  header.innerHTML = `
    <span class="avatar-mini">${escapeHtml(initials(ticket.contactName))}</span>
    <div class="ich-info">
      <strong>${escapeHtml(ticket.contactName)}</strong>
      <small>${escapeHtml(ticket.contactPhone || "")}</small>
    </div>
    <div class="ich-tags">
      <span class="badge ${TICKET_PRIORITY_BADGE[ticket.priority] || "badge-neutral"}">${TICKET_PRIORITY_LABELS[ticket.priority] || ticket.priority}</span>
      <span class="badge badge-neutral">${TICKET_STATUS_LABELS[ticket.status] || ticket.status}</span>
    </div>`;
}

function inboxMsgContent(m) {
  const url = m.mediaId ? `/api/media/${m.mediaId}` : "";
  let media = "";
  if (url && m.type === "image") media = `<a href="${url}" target="_blank" rel="noopener"><img class="msg-media-img" src="${url}" alt="imagem"></a>`;
  else if (url && m.type === "audio") media = `<audio controls src="${url}" class="msg-media-audio"></audio>`;
  else if (url && m.type === "video") media = `<video controls class="msg-media-video" src="${url}"></video>`;
  else if (url && m.type === "document") media = `<a class="msg-media-doc" href="${url}" target="_blank" rel="noopener">📎 ${escapeHtml(m.mediaName || "documento")}</a>`;
  const text = m.body ? `<p>${escapeHtml(m.body)}</p>` : "";
  return media + text;
}

function renderInboxChat(ticket) {
  const chat = document.getElementById("inboxChat");
  const messages = ticket.conversation?.messages || [];
  chat.innerHTML = messages.length
    ? messages.map((m) => m.direction === "internal"
      ? `<div class="message-note">
          <div class="note-head">🔒 Nota interna${m.authorName ? ` · ${escapeHtml(m.authorName)}` : ""}</div>
          <p>${escapeHtml(m.body)}</p>
          <small>${formatDateTime(m.createdAt)}</small>
        </div>`
      : `<div class="message ${m.direction}">
          ${inboxMsgContent(m)}
          <div class="msg-meta">
            <small>${formatDateTime(m.createdAt)}</small>
            ${m.direction === "outbound" ? renderMsgStatus(m.status) : ""}
          </div>
        </div>`).join("")
    : `<div class="inbox-empty small"><p>Sem mensagens nesta conversa ainda.</p></div>`;
  chat.scrollTop = chat.scrollHeight;

  const replyBox = document.getElementById("inboxReplyBox");
  replyBox.hidden = ticket.status === "closed";
  const quick = document.getElementById("inboxQuickReplies");
  quick.innerHTML = QUICK_REPLIES.map((r, i) => `<button class="quick-reply-chip" data-quick="${i}" type="button">${escapeHtml(r.length > 32 ? r.slice(0, 30) + "…" : r)}</button>`).join("");
  quick.querySelectorAll("[data-quick]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = document.getElementById("inboxReplyText");
      input.value = QUICK_REPLIES[Number(btn.dataset.quick)];
      input.focus();
    });
  });
}

function renderInboxContext(ticket) {
  const ctx = document.getElementById("inboxContext");
  const ai = ticket.aiClassification;
  const analystOptions = state.ticketAnalysts.map((a) =>
    `<option value="${a.id}" ${a.id === ticket.assignedAnalystId ? "selected" : ""}>${escapeHtml(a.name)}</option>`
  ).join("");
  const isClosed = ticket.status === "closed";

  ctx.innerHTML = `
    <div class="ctx-section ctx-client">
      <span class="avatar-lg">${escapeHtml(initials(ticket.contactName))}</span>
      <strong>${escapeHtml(ticket.contactName)}</strong>
      <small>${escapeHtml(ticket.contactPhone || "")}</small>
      ${ticket.customerName
        ? `<span class="ctx-customer-tag">🏢 ${escapeHtml(ticket.customerName)}</span>
           ${ticket.customerId && hasPermission("vault:view")
             ? `<button class="btn btn-sm" id="inboxVaultBtn" type="button">🔑 Acessos${ticket.customerCredentialsCount ? ` (${ticket.customerCredentialsCount})` : ""}</button>`
             : ""}`
        : (isClosed ? "" : `<select id="inboxCustomerSelect" class="search-input">
            <option value="">🏢 Vincular a um cliente…</option>
            ${(state.customers || []).map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("")}
          </select>`)}
    </div>
    <div class="ctx-section">
      <h4>Ticket</h4>
      <p class="ctx-subject">${escapeHtml(ticket.subject || "")}</p>
      <div class="ctx-badges">
        <span class="badge ${TICKET_PRIORITY_BADGE[ticket.priority] || "badge-neutral"}">${TICKET_PRIORITY_LABELS[ticket.priority] || ticket.priority}</span>
        <span class="badge badge-info">${TICKET_CATEGORY_LABELS[ticket.category] || ticket.category}</span>
        <span class="badge badge-neutral">${TICKET_STATUS_LABELS[ticket.status] || ticket.status}</span>
      </div>
      <small class="ctx-meta">Aberto há ${ticketTimeOpen(ticket.openedAt)}</small>
    </div>
    <div class="ctx-section ctx-timer">
      <h4>Tempo de atendimento</h4>
      <div class="timer-display" id="inboxTimerDisplay">${formatDuration(timerTotalSeconds(ticket.timeTracking))}</div>
      <div class="timer-state" id="inboxTimerState">${timerStateLabel(ticket.timeTracking)}</div>
      ${ticket.customerHourlyBilling ? `<small class="timer-cost">Cliente com cobrança por horas</small>` : ""}
      ${!isClosed ? `<div class="timer-controls">
        <button class="btn btn-secondary" data-timer="start" type="button" title="Iniciar">▶</button>
        <button class="btn btn-secondary" data-timer="pause" type="button" title="Pausar">⏸</button>
        <button class="btn btn-secondary" data-timer="stop" type="button" title="Encerrar tempo">⏹</button>
      </div>` : ""}
    </div>
    ${ai ? `<div class="ctx-section ctx-ai">
      <h4>🤖 Classificação IA <span class="ctx-confidence">${Math.round((ai.confidence || 0) * 100)}%</span></h4>
      <p>${escapeHtml(ai.reasoning || "—")}</p>
    </div>` : ""}
    ${hasPermission("kb:view") ? `<div class="ctx-section ctx-assist">
      <h4>💡 Apoio da base</h4>
      <button class="btn btn-sm" id="inboxAssistBtn" type="button">Sugerir conteúdo</button>
      <div id="inboxAssistResult"></div>
    </div>` : ""}
    ${isClosed ? `<div class="ctx-section"><span class="badge badge-success">Atendimento encerrado</span></div>` : `
    <div class="ctx-section ctx-actions">
      <h4>Ações</h4>
      ${ticket.assignedAnalystId === state.currentUser?.id
        ? `<span class="ctx-claimed">✓ Você é o responsável por este atendimento</span>`
        : `<button class="btn btn-primary" id="inboxClaimBtn" type="button">✋ Assumir atendimento${ticket.analystName ? ` (de ${escapeHtml(ticket.analystName)})` : ""}</button>`}
      <label class="ctx-field">
        <span>Analista responsável</span>
        <select id="inboxAssignSelect" class="search-input">
          <option value="">— Não atribuído —</option>
          ${analystOptions}
        </select>
      </label>
      <div class="ctx-status-row">
        <button class="btn btn-secondary ${ticket.status === "waiting_customer" ? "active" : ""}" data-inbox-status="waiting_customer" type="button">Aguardar cliente</button>
        <button class="btn btn-secondary ${ticket.status === "waiting_analyst" ? "active" : ""}" data-inbox-status="waiting_analyst" type="button">Aguardar analista</button>
      </div>
      <button id="inboxCloseBtn" class="btn btn-danger" type="button">Encerrar atendimento</button>
    </div>`}`;

  if (!isClosed) {
    document.getElementById("inboxAssignSelect")?.addEventListener("change", (e) => inboxAssign(e.target.value || null));
    ctx.querySelectorAll("[data-inbox-status]").forEach((b) => b.addEventListener("click", () => inboxSetStatus(b.dataset.inboxStatus)));
    document.getElementById("inboxCloseBtn")?.addEventListener("click", inboxClose);
    ctx.querySelectorAll("[data-timer]").forEach((b) => b.addEventListener("click", () => inboxTimer(b.dataset.timer)));
    document.getElementById("inboxCustomerSelect")?.addEventListener("change", (e) => inboxLinkCustomer(e.target.value));
    document.getElementById("inboxClaimBtn")?.addEventListener("click", () => inboxAssign(state.currentUser?.id));
  }
  document.getElementById("inboxVaultBtn")?.addEventListener("click", () => openVault(ticket.customerId, ticket.customerName));
  document.getElementById("inboxAssistBtn")?.addEventListener("click", inboxAssist);
  startInboxTimerTick(ticket);
}

async function inboxAssist() {
  const ticket = state.inbox.activeTicket;
  const msgs = ticket?.conversation?.messages || [];
  const lastInbound = [...msgs].reverse().find((m) => m.direction === "inbound");
  const message = (lastInbound?.body || ticket?.subject || "").trim();
  const result = document.getElementById("inboxAssistResult");
  if (!message) { result.innerHTML = `<small class="cell-muted">Sem mensagem do cliente para analisar.</small>`; return; }
  result.innerHTML = `<small class="cell-muted">Analisando a base...</small>`;
  try {
    const res = await api("/api/kb/assist", { method: "POST", body: JSON.stringify({ message }) });
    if (!res.suggestions?.length) {
      result.innerHTML = `<small class="cell-muted">${escapeHtml(res.guidance || "Nada encontrado na base.")}</small>`;
      return;
    }
    result.innerHTML = `
      ${res.guidance ? `<p class="assist-guidance">${escapeHtml(res.guidance)}</p>` : ""}
      ${res.suggestions.map((s) => `<div class="assist-item" data-kb-open="${s.id}"><strong>${escapeHtml(s.title)}</strong><small>${escapeHtml(s.reason)}</small></div>`).join("")}`;
    result.querySelectorAll("[data-kb-open]").forEach((el) => el.addEventListener("click", async () => {
      const r = await api("/api/kb").catch(() => ({ data: [] }));
      kbList = r.data || [];
      const a = kbList.find((x) => x.id === el.dataset.kbOpen);
      if (a) window.openKbModal(a);
    }));
  } catch (e) {
    result.innerHTML = `<small style="color:var(--rose)">Erro: ${escapeHtml(e.message)}</small>`;
  }
}

function formatMoney(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value) || 0);
}

async function inboxLinkCustomer(customerId) {
  const ticket = state.inbox.activeTicket;
  if (!ticket || !customerId || !ticket.contactId) return;
  try {
    await api(`/api/contacts/${ticket.contactId}`, { method: "PATCH", body: JSON.stringify({ customerId }) });
    setStatus("Contato vinculado ao cliente");
    await selectInboxTicket(ticket.id);
  } catch (error) {
    setStatus(`Erro ao vincular: ${error.message}`);
  }
}

// ===== Cronômetro (display em tempo real) =====
function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function timerTotalSeconds(tt) {
  if (!tt) return 0;
  let total = tt.accumulatedSeconds || 0;
  if (tt.status === "running" && tt.lastStartedAt) {
    total += Math.max(0, Math.floor((Date.now() - new Date(tt.lastStartedAt).getTime()) / 1000));
  }
  return total;
}

function timerStateLabel(tt) {
  const map = { running: "● Em andamento", paused: "❚❚ Pausado", stopped: "■ Parado" };
  return map[tt?.status] || map.stopped;
}

function startInboxTimerTick(ticket) {
  if (state.inbox.timerInterval) { clearInterval(state.inbox.timerInterval); state.inbox.timerInterval = null; }
  const tt = ticket?.timeTracking;
  if (tt?.status !== "running") return;
  state.inbox.timerInterval = setInterval(() => {
    const display = document.getElementById("inboxTimerDisplay");
    if (!display) { clearInterval(state.inbox.timerInterval); state.inbox.timerInterval = null; return; }
    display.textContent = formatDuration(timerTotalSeconds(tt));
  }, 1000);
}

async function inboxTimer(action) {
  if (!state.inbox.activeId) return;
  try {
    const updated = await api(`/api/tickets/${state.inbox.activeId}/timer`, { method: "POST", body: JSON.stringify({ action }) });
    if (state.inbox.activeTicket) state.inbox.activeTicket.timeTracking = updated.timeTracking;
    renderInboxContext(state.inbox.activeTicket);
  } catch (error) {
    setStatus(`Erro no cronômetro: ${error.message}`);
  }
}

async function inboxAction(path, body, successMsg) {
  try {
    await api(path, { method: "POST", body: JSON.stringify(body || {}) });
    if (successMsg) setStatus(successMsg);
    await renderInbox();
    if (state.inbox.activeId) await selectInboxTicket(state.inbox.activeId);
  } catch (error) {
    setStatus(`Erro: ${error.message}`);
  }
}

let inboxPendingMedia = null; // { dataBase64, name, mime }
let inboxRecorder = null, inboxChunks = [];
let inboxNoteMode = false;

function setInboxNoteMode(on) {
  inboxNoteMode = on;
  const btn = document.getElementById("inboxNoteToggle");
  const input = document.getElementById("inboxReplyText");
  const box = document.getElementById("inboxReplyBox");
  if (btn) btn.classList.toggle("active", on);
  if (box) box.classList.toggle("note-mode", on);
  if (input) input.placeholder = on ? "Nota interna (só a equipe vê)..." : "Digite sua resposta (ou cole um print com Ctrl+V)...";
}

async function inboxReply() {
  const ticket = state.inbox.activeTicket;
  if (!ticket) return;
  const input = document.getElementById("inboxReplyText");
  const caption = input.value.trim();
  // Nota interna: não vai pro cliente
  if (inboxNoteMode && !inboxPendingMedia) {
    if (!caption) return;
    input.value = "";
    input.style.height = "auto";
    setInboxNoteMode(false);
    await inboxAction(`/api/tickets/${ticket.id}/note`, { body: caption }, "Nota interna adicionada");
    return;
  }
  if (inboxPendingMedia) {
    const media = inboxPendingMedia;
    clearPendingMedia();
    input.value = "";
    input.style.height = "auto";
    await inboxAction(`/api/tickets/${ticket.id}/media`, { name: media.name, mime: media.mime, dataBase64: media.dataBase64, caption }, "Mídia enviada");
    return;
  }
  if (!caption) return;
  input.value = "";
  input.style.height = "auto";
  await inboxAction(`/api/tickets/${ticket.id}/messages`, { body: caption }, "Mensagem enviada");
}

function setPendingMedia(file) {
  if (!file) return;
  if (file.size > 30 * 1024 * 1024) { setStatus("Arquivo muito grande (máx 30MB)"); return; }
  const reader = new FileReader();
  reader.onload = () => {
    inboxPendingMedia = { dataBase64: String(reader.result).split(",")[1], name: file.name || "anexo", mime: file.type || "application/octet-stream" };
    const el = document.getElementById("inboxMediaPreview");
    el.hidden = false;
    const url = URL.createObjectURL(file);
    const mime = file.type || "";
    el.innerHTML = `
      ${mime.startsWith("image/") ? `<img src="${url}" class="media-preview-img">`
        : mime.startsWith("audio/") ? `<audio controls src="${url}"></audio>`
        : `<span class="media-preview-doc">📎 ${escapeHtml(file.name || "anexo")}</span>`}
      <button class="inbox-icon-btn" id="inboxMediaClear" type="button" title="Remover">✕</button>`;
    document.getElementById("inboxMediaClear").addEventListener("click", clearPendingMedia);
  };
  reader.readAsDataURL(file);
}

function clearPendingMedia() {
  inboxPendingMedia = null;
  const el = document.getElementById("inboxMediaPreview");
  if (el) { el.hidden = true; el.innerHTML = ""; }
}

async function toggleInboxRecord() {
  const btn = document.getElementById("inboxRecordBtn");
  if (inboxRecorder && inboxRecorder.state === "recording") { inboxRecorder.stop(); return; }
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    setStatus("Gravação de áudio não suportada neste navegador");
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    inboxChunks = [];
    inboxRecorder = new MediaRecorder(stream);
    inboxRecorder.ondataavailable = (e) => { if (e.data.size) inboxChunks.push(e.data); };
    inboxRecorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(inboxChunks, { type: inboxChunks[0]?.type || "audio/webm" });
      setPendingMedia(new File([blob], `audio-${Date.now()}.webm`, { type: blob.type }));
      btn.classList.remove("recording");
      btn.textContent = "🎤";
      setStatus("Áudio pronto — clique em Enviar");
    };
    inboxRecorder.start();
    btn.classList.add("recording");
    btn.textContent = "⏹";
    setStatus("Gravando áudio... clique no botão para parar");
  } catch {
    setStatus("Não foi possível acessar o microfone");
  }
}

async function inboxAssign(analystId) {
  if (!state.inbox.activeId) return;
  await inboxAction(`/api/tickets/${state.inbox.activeId}/assign`, { analystId }, "Atendimento atribuído");
}

async function inboxSetStatus(status) {
  if (!state.inbox.activeId) return;
  await inboxAction(`/api/tickets/${state.inbox.activeId}/status`, { status }, "Status atualizado");
}

async function inboxClose() {
  if (!state.inbox.activeId) return;
  const note = window.prompt("Nota de encerramento (opcional):", "") ?? "";
  await inboxAction(`/api/tickets/${state.inbox.activeId}/close`, { closureNote: note }, "Atendimento encerrado");
}

function wireInboxEvents() {
  document.querySelectorAll(".inbox-tab").forEach((tab) => {
    tab.addEventListener("click", () => { state.inbox.tab = tab.dataset.inboxTab; renderInboxQueue(); });
  });
  document.getElementById("inboxSearch")?.addEventListener("input", (e) => { state.inbox.search = e.target.value; renderInboxQueue(); });
  document.getElementById("inboxPriority")?.addEventListener("change", renderInboxQueue);
  document.getElementById("inboxCategory")?.addEventListener("change", renderInboxQueue);
  document.getElementById("inboxReplyBtn")?.addEventListener("click", inboxReply);
  const replyInput = document.getElementById("inboxReplyText");
  replyInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); inboxReply(); }
  });
  replyInput?.addEventListener("input", () => {
    replyInput.style.height = "auto";
    replyInput.style.height = Math.min(replyInput.scrollHeight, 120) + "px";
  });
  // Colar print (Ctrl+V) com imagem
  replyInput?.addEventListener("paste", (e) => {
    const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image/"));
    if (item) { const file = item.getAsFile(); if (file) { e.preventDefault(); setPendingMedia(file); } }
  });
  // Anexar arquivo
  document.getElementById("inboxAttachBtn")?.addEventListener("click", () => document.getElementById("inboxFileInput").click());
  document.getElementById("inboxFileInput")?.addEventListener("change", (e) => { if (e.target.files[0]) setPendingMedia(e.target.files[0]); e.target.value = ""; });
  // Gravar áudio
  document.getElementById("inboxRecordBtn")?.addEventListener("click", toggleInboxRecord);
  // Nota interna (toggle)
  document.getElementById("inboxNoteToggle")?.addEventListener("click", () => setInboxNoteMode(!inboxNoteMode));
}

wireInboxEvents();

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
