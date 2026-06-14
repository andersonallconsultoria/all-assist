// Popula o banco com atendimentos de exemplo para visualizar a Central.
// Uso: pare o servidor/container, rode `node scripts/seed-demo.mjs`, suba de novo.
// Idempotente: remove os dados marcados como demo antes de recriar.
import { CrmDataStore } from "../src/crmDataStore.js";
import { TicketService } from "../src/ticketService.js";

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
for (const coll of ["tickets", "messages", "conversations", "contacts"]) {
  const ids = store.list(coll).filter((r) => r.demo).map((r) => r.id);
  ids.forEach((id) => store.remove(coll, id));
}

const hoursAgo = (h) => new Date(Date.now() - h * 3600 * 1000).toISOString();

const DEMO = [
  { name: "Maria Silva", phone: "5534998810001", category: "complaint", priority: "high", assign: true, status: "waiting_customer", openH: 3,
    subject: "Pedido atrasado há 5 dias",
    msgs: [["in","Bom dia, meu pedido está atrasado há 5 dias e ninguém me responde!"],["out","Olá Maria, sinto muito pelo transtorno. Vou verificar agora mesmo o status do seu pedido."],["in","Por favor, preciso disso com urgência."],["out","Entendo. Localizei seu pedido, está em trânsito e chega até amanhã. Vou te enviar o rastreio."]] },
  { name: "João Souza", phone: "5534998810002", category: "question", priority: "medium", assign: false, status: "open", openH: 0.3,
    subject: "Dúvida sobre horário de funcionamento",
    msgs: [["in","Oi, vocês atendem aos sábados?"]] },
  { name: "Ana Costa", phone: "5534998810003", category: "support", priority: "critical", assign: false, status: "open", openH: 0.1,
    subject: "Sistema fora do ar",
    msgs: [["in","O sistema parou de funcionar aqui na loja!"],["in","Não consigo emitir nota, preciso de ajuda AGORA."]] },
  { name: "Pedro Lima", phone: "5534998810004", category: "sales", priority: "low", assign: true, status: "open", openH: 6,
    subject: "Orçamento de novo plano",
    msgs: [["in","Gostaria de saber sobre planos maiores."],["out","Claro, Pedro! Temos o plano Pro. Posso te enviar os detalhes?"]] },
  { name: "Carla Dias", phone: "5534998810005", category: "compliment", priority: "low", assign: false, status: "open", openH: 26,
    subject: "Elogio ao atendimento",
    msgs: [["in","Só queria agradecer, o atendimento de vocês é excelente!"]] },
  { name: "Roberto Alves", phone: "5534998810006", category: "support", priority: "medium", assign: true, status: "waiting_analyst", openH: 1.5,
    subject: "Erro ao fazer login",
    msgs: [["in","Não consigo entrar na minha conta."],["out","Vou te ajudar. Pode me dizer o e-mail cadastrado?"],["in","roberto@email.com"]] }
];

let count = 0;
for (const d of DEMO) {
  const contact = store.insert("contacts", { tenantId: tenant.id, name: d.name, phone: d.phone, source: "demo", demo: true });
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
  if (d.assign && admin) patch.assignedAnalystId = admin.id;
  if (d.status !== "open") { patch.status = d.status; patch.firstResponseAt = hoursAgo(d.openH - 0.1); }
  store.update("tickets", ticket.id, patch);
  count++;
}

store.save();
console.log(`✓ ${count} atendimentos de exemplo criados no tenant "${tenant.name}".`);
console.log("  Suba o servidor e abra o menu Atendimento para ver a Central populada.");
