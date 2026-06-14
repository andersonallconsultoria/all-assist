// Popula o banco com atendimentos de exemplo para visualizar a Central.
// Uso: pare o servidor/container, rode `node scripts/seed-demo.mjs`, suba de novo.
// Idempotente: remove os dados marcados como demo antes de recriar.
import { CrmDataStore } from "../src/crmDataStore.js";
import { TicketService } from "../src/ticketService.js";
import { AuthService } from "../src/authService.js";
import { VaultService } from "../src/vaultService.js";

const DATA_FILE = process.env.CRM_DATA_FILE || "data/crm.json";
const store = new CrmDataStore(DATA_FILE);
store.load();

const tenant = store.findOne("tenants", (t) => t.slug === "default") || store.list("tenants")[0];
if (!tenant) {
  console.error("Nenhum tenant encontrado. Rode o servidor uma vez antes (cria o tenant padrão).");
  process.exit(1);
}
const admin = store.findOne("users", (u) => (u.email || "").includes("admin")) || store.list("users")[0];
const ticketService = new TicketService(store, { debug() {}, info() {}, warn() {}, error() {} });

// Limpa demo anterior
for (const coll of ["tickets", "messages", "conversations", "contacts", "customers", "credentials"]) {
  const ids = store.list(coll).filter((r) => r.demo).map((r) => r.id);
  ids.forEach((id) => store.remove(coll, id));
}

const hoursAgo = (h) => new Date(Date.now() - h * 3600 * 1000).toISOString();

// Clientes (empresas) de exemplo — dados reais de cadastro fiscal
const customerDefs = [
  { key: "verdi", name: "Comercial de Alimentos e Lanchonete São José Ltda", fantasia: "Supermercado Verdi Bairro", cnpj: "10.927.402/0001-90", ie: "0752309000138", uf: "DF", regime: "real", atividade: "comercio", matrizFilial: "matriz", blocoK: false, hourlyBilling: true },
  { key: "jao", name: "Comércio de Alimentos Jaó Ltda", fantasia: "Mercadinho Jaó", cnpj: "00.065.979/0001-86", ie: "100495729", uf: "GO", regime: "real", atividade: "comercio", matrizFilial: "matriz", blocoK: false, hourlyBilling: false },
  { key: "varanda", name: "Varanda Frutas e Mercearia Ltda", fantasia: "Varanda Frutas", cnpj: "62.498.365/0001-45", ie: "112607253116", uf: "SP", regime: "real", atividade: "comercio", matrizFilial: "matriz", blocoK: false, hourlyBilling: true },
  { key: "superbig", name: "Mello & Silva Ltda", fantasia: "SuperBig Supermercado - Loja 01", cnpj: "090.979.930/0001-36", ie: "294032223", uf: "TO", regime: "real", atividade: "comercio_atacado", matrizFilial: "matriz", blocoK: true, hourlyBilling: true },
  { key: "genial", name: "Genial Comércio Atacadista de Produtos Alimentícios Eireli", fantasia: "Genial Distribuidora", cnpj: "22.417.045/0001-07", ie: "0772629100103", uf: "DF", regime: "real", atividade: "atacado", matrizFilial: "matriz", blocoK: true, hourlyBilling: false }
];
const customers = {};
for (const c of customerDefs) {
  const { key, ...fields } = c;
  customers[key] = store.insert("customers", { tenantId: tenant.id, ...fields, demo: true });
}

// Cofre de acessos de exemplo (criptografado)
const vault = new VaultService(store, { debug() {}, info() {}, warn() {}, error() {} });
const credDefs = [
  { cust: "superbig", category: "access", label: "Banco de dados ERP", type: "database", host: "192.168.0.10", port: "5432", database: "erp_prod", username: "consulta", password: "Big@2026db" },
  { cust: "superbig", category: "connection", label: "Servidor (RDP)", type: "rdp", host: "187.10.20.30", port: "3389", username: "administrador", password: "Rdp#Big2026" },
  { cust: "superbig", category: "connection", label: "TeamViewer Loja 01", type: "teamviewer", accessId: "1 234 567 890", password: "tvBig2026" },
  { cust: "verdi", category: "access", label: "Banco SQL Verdi", type: "database", host: "10.0.0.5", port: "1433", database: "VERDI", username: "sa", password: "Verdi$2026" },
  { cust: "verdi", category: "connection", label: "AnyDesk Caixa", type: "anydesk", accessId: "987 654 321", password: "adVerdi2026" }
];
for (const cd of credDefs) {
  const cust = customers[cd.cust];
  if (!cust) continue;
  const { cust: _omit, ...fields } = cd;
  const created = vault.createCredential(tenant.id, cust.id, fields, "seed");
  store.update("credentials", created.id, { demo: true });
}

// Analistas (equipe de atendimento) — role analista
const ANALISTAS = [
  ["Anderson Santos", "anderson.santos.fconsultoria@gmail.com"],
  ["Anna Caroline", "annacaroline159159@gmail.com"],
  ["Cassius Gabriel", "cassius.gabriel.contabil@gmail.com"],
  ["Cleidiane França", "cleidiane.franca.contabil@gmail.com"],
  ["Daiani Devens", "daiani.devens.contabil@gmail.com"],
  ["Desielle Farias", "desielle.farias.contabil@gmail.com"],
  ["Gustavo Melo", "gustavo.freitasconsultoria@gmail.com"],
  ["Keli Cristina", "keli.freitas.contabil@gmail.com"],
  ["Luana Viera", "contabil.luana.vieira@gmail.com"],
  ["Maria Betania", "mariabetaniafreitascontabilida@gmail.com"],
  ["Tayane Ferreira", "fiscal.contabilfreitas@gmail.com"]
];
const analistaRole = store.findOne("roles", (r) => r.key === "analista");
const auth = new AuthService(store, { auth: {} }, { debug() {}, info() {}, warn() {}, error() {} });
const DEFAULT_PASSWORD = process.env.SEED_ANALYST_PASSWORD || "Freitas@2026";
let analistasCriados = 0;
for (const [nome, email] of ANALISTAS) {
  const existing = store.findOne("users", (u) => u.email === email.toLowerCase());
  if (existing) continue;
  auth.createUser({ name: nome, email, password: DEFAULT_PASSWORD, roleId: analistaRole?.id, tenantId: tenant.id, status: "active", emailVerifiedAt: new Date().toISOString() });
  analistasCriados++;
}

const DEMO = [
  { name: "Maria Silva", cust: "superbig", phone: "5534998810001", category: "complaint", priority: "high", assign: true, status: "waiting_customer", openH: 3, mins: 95,
    subject: "Pedido atrasado há 5 dias",
    msgs: [["in","Bom dia, meu pedido está atrasado há 5 dias e ninguém me responde!"],["out","Olá Maria, sinto muito pelo transtorno. Vou verificar agora mesmo o status do seu pedido."],["in","Por favor, preciso disso com urgência."],["out","Entendo. Localizei seu pedido, está em trânsito e chega até amanhã. Vou te enviar o rastreio."]] },
  { name: "João Souza", cust: "verdi", phone: "5534998810002", category: "question", priority: "medium", assign: false, status: "open", openH: 0.3,
    subject: "Dúvida sobre horário de funcionamento",
    msgs: [["in","Oi, vocês atendem aos sábados?"]] },
  { name: "Ana Costa", cust: "jao", phone: "5534998810003", category: "support", priority: "critical", assign: false, status: "open", openH: 0.1,
    subject: "Sistema fora do ar",
    msgs: [["in","O sistema parou de funcionar aqui na loja!"],["in","Não consigo emitir nota, preciso de ajuda AGORA."]] },
  { name: "Pedro Lima", cust: "superbig", phone: "5534998810004", category: "sales", priority: "low", assign: true, status: "open", openH: 6, mins: 140,
    subject: "Orçamento de novo plano",
    msgs: [["in","Gostaria de saber sobre planos maiores."],["out","Claro, Pedro! Temos o plano Pro. Posso te enviar os detalhes?"]] },
  { name: "Carla Dias", cust: "varanda", phone: "5534998810005", category: "compliment", priority: "low", assign: false, status: "open", openH: 26,
    subject: "Elogio ao atendimento",
    msgs: [["in","Só queria agradecer, o atendimento de vocês é excelente!"]] },
  { name: "Roberto Alves", cust: "genial", phone: "5534998810006", category: "support", priority: "medium", assign: true, status: "waiting_analyst", openH: 1.5, mins: 50,
    subject: "Erro ao fazer login",
    msgs: [["in","Não consigo entrar na minha conta."],["out","Vou te ajudar. Pode me dizer o e-mail cadastrado?"],["in","roberto@email.com"]] }
];

const analistas = store.findAll("users", (u) => u.tenantId === tenant.id && u.roleId === analistaRole?.id);
let count = 0;
for (const d of DEMO) {
  const contact = store.insert("contacts", { tenantId: tenant.id, name: d.name, phone: d.phone, customerId: customers[d.cust]?.id || null, source: "demo", demo: true });
  const conversation = store.insert("conversations", { tenantId: tenant.id, contactId: contact.id, status: "open", channel: "whatsapp", demo: true, unreadCount: d.assign ? 0 : 1 });
  d.msgs.forEach(([dir, body], i) => {
    store.insert("messages", {
      tenantId: tenant.id,
      conversationId: conversation.id,
      direction: dir === "in" ? "inbound" : "outbound",
      body,
      status: dir === "in" ? "read" : "delivered",
      demo: true,
      createdAt: hoursAgo(d.openH - i * 0.05)
    });
  });
  const ticket = ticketService.createTicket({
    tenantId: tenant.id,
    contactId: contact.id,
    conversationId: conversation.id,
    firstMessage: d.msgs[0][1],
    contactName: d.name,
    aiClassification: { category: d.category, priority: d.priority, subject: d.subject, confidence: 0.85 + Math.round(Math.random() * 10) / 100, reasoning: `Mensagem classificada como ${d.category} de prioridade ${d.priority}.` }
  });
  const patch = { openedAt: hoursAgo(d.openH), demo: true };
  if (d.mins) patch.timeTracking = { status: "stopped", accumulatedSeconds: d.mins * 60, lastStartedAt: null };
  const analyst = analistas.length ? analistas[count % analistas.length] : admin;
  if (d.assign && analyst) patch.assignedAnalystId = analyst.id;
  if (d.status !== "open") { patch.status = d.status; patch.firstResponseAt = hoursAgo(d.openH - 0.1); }
  store.update("tickets", ticket.id, patch);
  count++;
}

store.save();
console.log(`✓ ${count} atendimentos, ${customerDefs.length} clientes e ${analistasCriados} analistas de exemplo no tenant "${tenant.name}".`);
if (analistasCriados > 0) console.log(`  Senha inicial dos analistas: ${DEFAULT_PASSWORD}`);
console.log("  Suba o servidor e abra o menu Atendimento para ver a Central populada.");
