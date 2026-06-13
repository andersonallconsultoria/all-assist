# Prompt inicial — ALL Assist

Cole este texto na primeira mensagem do Claude Code quando abrir o VS Code na pasta `c:\Projetos Dev\all-assist`.

---

## Briefing

Você é o Claude Code trabalhando no projeto **ALL Assist** — uma plataforma SaaS white-label de **atendimento ao cliente via WhatsApp** com agentes de IA.

**Antes de qualquer coisa, leia o [CLAUDE.md](CLAUDE.md) inteiro.** Ele tem todo o contexto, decisões, roadmap, stack e arquitetura.

## Contexto rápido

Este repositório nasceu há poucas horas como um **fork do projeto Neurax CRM** (`c:\Projetos Dev\fly-crm-platform`). A cópia inicial preserva o código completo do CRM, mas o ALL Assist é uma **ferramenta diferente**: o foco é atendimento ao cliente via WhatsApp com tickets, analistas, relatórios e IA.

O CRM Neurax continua existindo em paralelo (`c:\Projetos Dev\fly-crm-platform`) e **não deve ser modificado por aqui** — qualquer mudança nele é feita na outra janela do VS Code.

## O que precisa ser feito (Fase 1 — MVP até segunda-feira)

Em ordem de execução:

### 1. Renomear identidade do projeto
- Substituir `neuraxcrm` → `allassist` (todos os arquivos: package.json, env vars, cookies, branding)
- Substituir `Neurax CRM` → `ALL Assist` (UI, master panel, README)
- Cookie sessão: `neuraxcrm_session` → `allassist_session`
- Prefixo env: `NEURAXCRM_*` → `ALLASSIST_*`
- Domínio: `neuraxcrm.com.br` → `allassist.com.br`

### 2. Limpar resíduos do CRM
Remover completamente (código + UI + endpoints + testes):
- `src/localCissSyncService.js` (ERP sync)
- `src/dealExpiryService.js` (expiry de orçamento)
- `src/mapper.js` (mapeamento CISS)
- `src/erpIntegrationService.js`, `src/integrationScheduleService.js`
- `src/commercialStructureService.js` (vendedores, grupos comerciais)
- Telas: `#deals`, `#orders-list` (Análise Comercial), `#erp-settings`, `#deal-detail`
- Kanban de pipeline de vendas, badges de expiry, abas Orçamentos/Pedidos
- Variáveis env: `CRM_*`, `CISS_*`

Manter intactos:
- `src/whatsappMetaClient.js`, webhooks Meta e Evolution
- `src/authService.js`, sessões, roles, permissions
- `src/tenantContext.js` (multi-tenant)
- `src/conversationService.js`
- `src/crmDataStore.js` (renomear pra `dataStore.js`, manter API)
- `public/master.html`/`master.js` (master panel — ajustar UI, manter funcionalidade)

### 3. Implementar entidade Ticket

```javascript
{
  id: "tk_xxx",
  tenantId: "tenant_xxx",
  contactId: "ct_xxx",
  conversationId: "cv_xxx",
  assignedAnalystId: "us_xxx" | null,
  status: "open" | "waiting_customer" | "waiting_analyst" | "closed",
  priority: "low" | "medium" | "high" | "critical",
  category: "support" | "question" | "complaint" | "compliment" | "sales" | "other",
  subject: "Resumo gerado pela IA",
  slaDueAt: "ISO date",
  openedAt: "ISO date",
  firstResponseAt: "ISO date" | null,
  closedAt: "ISO date" | null,
  closedBy: "us_xxx" | null,
  closureNote: "...",
  aiClassification: {
    model: "claude-haiku-4-5-20251001",
    confidence: 0.92,
    reasoning: "...",
    classifiedAt: "ISO date"
  },
  logs: [
    { type, note, actor, createdAt, metadata }
  ]
}
```

Criar `src/ticketService.js` com:
- `createTicket(conversation, firstMessage)` — chamado pelo webhook
- `assignTicket(ticketId, analystId)`
- `closeTicket(ticketId, closureNote, closedBy)`
- `transferTicket(ticketId, newAnalystId)`
- `listOpenTickets(tenantId, filters)`
- `addLog(ticketId, log)`

### 4. Webhook → Ticket automático

No webhook WhatsApp (Meta e Evolution):
- Se a mensagem é de **contato novo** ou de **conversa sem ticket aberto** → criar ticket
- Chamar **IA Classificador** antes de salvar (categoria, prioridade, subject)
- Vincular ticket à conversa
- Se já tem ticket aberto → só anexar mensagem ao ticket existente

### 5. Agente IA Classificador

Criar `src/agents/classifier.js`:

```javascript
async function classifyTicket({ contactName, conversationHistory, firstMessage }) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.CLASSIFIER_MODEL || "claude-haiku-4-5-20251001",
      max_tokens: 500,
      tools: [{
        name: "save_classification",
        description: "Salva a classificação do ticket",
        input_schema: { ... }  // category, priority, subject, reasoning, confidence
      }],
      tool_choice: { type: "tool", name: "save_classification" },
      messages: [{
        role: "user",
        content: `Classifique esta primeira mensagem de atendimento.\n\nCliente: ${contactName}\nMensagem: ${firstMessage}\n\nHistórico recente: ${conversationHistory}`
      }],
      system: "Você é um classificador de tickets de atendimento. Categorize em support/question/complaint/compliment/sales/other e priorize em low/medium/high/critical. Gere um subject curto (max 60 chars)."
    })
  });
  return parseToolResult(response);
}
```

Custo aproximado por ticket: **~$0.001 USD**.

### 6. Role Analista

Adicionar role `analista` no `authService.bootstrap()`:
```javascript
{ name: "analista", permissions: ["tickets:view", "tickets:respond", "tickets:close", "conversations:view"] }
```

E role `gerente`:
```javascript
{ name: "gerente", permissions: [...analista, "tickets:transfer", "tickets:reports", "analysts:manage"] }
```

### 7. Tela Tickets (frontend)

- Nova rota `#tickets` — lista de tickets abertos, filtros por status/prioridade/categoria/analista
- Visualização kanban (colunas: Abertos / Aguardando Cliente / Aguardando Analista / Fechados hoje)
- Card de ticket mostra: avatar+nome cliente, categoria, prioridade (cor), tempo aberto, último msg preview
- Click → abre `#ticket-detail` com chat + ações (Fechar, Transferir, Atribuir)
- Chat reusa componentes da UI de conversas existente

### 8. White-label config

Adicionar no Master Panel form pra cada tenant:
- Nome de exibição (`displayName`)
- URL do logo
- Cor primária (color picker)
- Domínio custom (texto livre — futuro CNAME)

Salvar em `tenant.branding`. Endpoint `GET /api/branding` retorna config do tenant ativo.

Frontend lê branding no boot e aplica via CSS vars (`--primary-color`) e replace de texto/logo.

### 9. Resolução host expandida

Em `src/tenantContext.js`, adicionar antes da resolução por subdomínio:
```javascript
const tenantByCustomDomain = store.findOne("tenants",
  t => t.branding?.customDomain === host
);
if (tenantByCustomDomain) return tenantByCustomDomain;
```

### 10. Deploy ECS

Espelhar config do `fly-crm-platform/infra/ecs/`:
- Criar ECR `allassist-platform`
- Criar cluster ECS `allassist-cluster`
- Criar task-definition family `allassist-platform`
- Criar `.github/workflows/deploy-ecs.yml` com OIDC
- Criar Route 53 hosted zone `allassist.com.br` (precisa registrar domínio antes)
- Criar ACM cert wildcard `*.allassist.com.br`
- Configurar ALB com listener 443 → target group ECS

## Como começar

1. **Leia [CLAUDE.md](CLAUDE.md) inteiro**
2. **Confira o estado atual** — `git status` (deve estar em repo novo, sem commits)
3. **Crie um TODO list** com os passos acima
4. **Pergunte ao Anderson** antes de cada decisão arquitetural que vire trade-off

## Regras

- **Português** em toda comunicação com o usuário
- **Commits frequentes** — um commit por subtarefa, mensagem descritiva
- **Push só com aprovação** — não pushar sem o Anderson confirmar
- **Testes** — rodar `node --test` antes de cada commit
- **Não modificar** `c:\Projetos Dev\fly-crm-platform` — esse é o CRM, fica em outra janela
- Manter a estrutura de **anti-ban Evolution** (intervalos, aquecimento)
- Toda IA deve ser opcional — sistema funciona sem `ANTHROPIC_API_KEY` (classificador retorna defaults nesse caso)

## Bom trabalho 🚀

Anderson está confiando no MVP até segunda-feira. Foque em entregar o essencial funcionando, deixe melhorias pra fases 2-4.
