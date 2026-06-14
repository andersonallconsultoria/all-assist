# CLAUDE.md — ALL Assist

Este arquivo guia o Claude Code (claude.ai/code) ao trabalhar neste repositório.

## Idioma
Sempre responda em **português** ao usuário deste repositório.

---

## O que é o ALL Assist

**ALL Assist** é uma plataforma SaaS white-label de **atendimento ao cliente via WhatsApp** com agentes de IA. O cliente envia mensagem no WhatsApp → ferramenta cria ticket automaticamente → IA classifica e prioriza → analista atende ou IA responde diretamente (em fases futuras).

**Dono:** Anderson Santos — consultor ERP solo, criador do SaaS, quer autonomia máxima.
**Cliente-alvo:** empresas que prestam atendimento via WhatsApp e querem profissionalizar com tickets, analistas, relatórios e IA.
**Modelo de venda:** SaaS multi-tenant white-label. Cada cliente (tenant) personaliza nome, logo, cores e pode apontar domínio próprio via CNAME.

---

## Origem do código

Este projeto **nasceu como fork** de [`fly-crm-platform`](https://github.com/andersonallconsultoria/fly-crm-platform) (ALL Assist). O CRM continua existindo e evoluindo separadamente — **não temos nenhuma intenção de fundir os dois projetos no nível de código**.

**Reaproveitado do CRM:**
- Integração **Meta WhatsApp Cloud API** (`src/whatsappMetaClient.js`)
- Integração **Evolution API** (Baileys) com infra `evo.allassist.com.br` — reusada
- Webhook handlers para Meta e Evolution
- Sistema de **Auth** (sessões cookie, roles, permissions, bootstrap)
- **Multi-tenant** por subdomínio (`src/tenantContext.js`)
- **Master Panel** (`public/master.html`) para gestão de tenants
- **UI de conversas** (bolhas WhatsApp, status ✓✓, temas dark/light)
- Persistência via JSON file (`CrmDataStore`) — pode migrar pra Postgres no futuro
- Infra ECS Fargate, ECR, GitHub Actions, ALB, Route 53

**Removido do CRM (não faz parte do ALL Assist):**
- ERP sync (`localCissSyncService.js`, `dealExpiryService.js`)
- Análise Comercial (Orçamentos/Pedidos)
- Pipelines de venda (Kanban de deals)
- Expiry de orçamento, badges de venda
- Painel ERP Settings, integração CISS/Integrim

**Adicionado de zero:**
- Entidade **Ticket** (id, cliente, conversa, analista, status, prioridade, categoria, SLA, abertura, fechamento)
- Tela de **Atendimento** (lista tickets abertos + chat + fechar/transferir)
- Cadastro de **Analista** (role nova reaproveitando o sistema de roles)
- **Agente IA Classificador** (Claude Haiku 4.5) — categoriza + prioriza ticket ao criar
- **White-label**: cada tenant configura nome, logo, cor primária e domínio CNAME próprio

---

## Tese conceitual herdada do AllHub

ALL Assist herda **ideias** (não código) do projeto AllHub (separado, Python/FastAPI em `c:\Projetos Dev\allhub`), que devem ser implementadas em Node.js neste repo nas fases futuras:

1. **Agentes IA especialistas com modo híbrido** — cada agente roda em 3 modos: automático (cron), manual (clique), conversacional (chat).
2. **Regras automáticas com triggers + ações** — "se ticket aberto >24h sem resposta → alertar gerente via Telegram". Catálogo de regras reutilizável entre tenants.
3. **Aprovação humana obrigatória em ações de IA** — IA propõe (`pending`) → analista revisa → aprova → executa.
4. **Análise comparativa (delta)** — não só métrica atual, mas diferença com período anterior. Insights nascem do delta.
5. **Documentação viva de agentes** — prompts e exemplos versionados em arquivos, agente evolui sem redeploy.

Essas ideias entram nas **Fases 3 e 4** abaixo.

---

## Roadmap de fases

### Fase 1 — MVP até segunda-feira (próxima entrega)
Esta é a fase atual de execução.

- [x] Renomear projeto para ALL Assist (código + UI + branding + manifestos)
- [x] Limpar resíduos do CRM — remoção completa de CRM/ERP: services órfãos, endpoints (deals/pipelines/sellers/products/integrations), telas e ~1390 linhas de JS morto; `crmDataStore` enxugado para o domínio de atendimento (coleção `tickets`, método `findAll`)
- [x] Implementar entidade `Ticket` (id, tenantId, contactId, conversationId, assignedAnalystId, status, priority, category, slaDueAt, openedAt, closedAt, closedBy, closureNote)
- [x] Webhook WhatsApp → cria ticket automático no primeiro contato de conversa nova
- [x] **Agente IA Classificador** — Claude Haiku 4.5 — categoriza (suporte/dúvida/reclamação/elogio/comercial) e prioriza (baixa/média/alta/crítica) ao criar ticket
- [x] Role `analista` (+ `gerente`) + atribuição manual de tickets
- [x] Tela `#tickets` — kanban (Abertos / Aguardando Analista / Aguardando Cliente / Fechados hoje) + filtros (prioridade, categoria, analista)
- [x] Detalhe do ticket — drawer com chat + ações (atribuir, status, fechar, responder). Painel inicial reescrito para métricas de atendimento (`/api/dashboard`)
- [ ] White-label config no Master Panel — nome, logo URL, cor primária por tenant
- [ ] Resolução host expandida — aceitar domínios CNAME apontados (não só `*.allassist.com.br`)
- [ ] Frontend renderiza nome/cor/logo do tenant ativo
- [ ] Deploy ECS espelhando padrão `allassist` (cluster, ECR, task-definition, GitHub Actions)

### Fase 2 — Semana seguinte (~7-10 dias)
- [ ] Suporte a **mídia** — envio/recebimento de imagens, áudio, PDF (Meta API + Evolution)
- [ ] Copy/paste de imagens na tela de atendimento (Ctrl+C/Ctrl+V)
- [ ] **Relatórios** — volume por analista, tempo médio de resposta, SLA cumprido, tickets por categoria
- [ ] **Notas internas** — analista adiciona notas no ticket sem cliente ver
- [ ] **API pública** `POST /api/tickets` — qualquer integração externa pode abrir ticket
- [ ] **Certificado SSL dinâmico** para domínio do cliente (ACM SAN ou Let's Encrypt automatizado)

### Fase 3 — Cérebro AllHub (semanas 3-4)
- [ ] **Agente IA Respondedor** — responde primeira mensagem se for dúvida frequente (FAQ vinculada a base de conhecimento)
- [ ] **Aprovação humana** — IA sugere resposta → analista revisa → envia (ou edita antes)
- [ ] **Sistema de regras** — `if ticket.status == "aberto" && ticket.lastReplyAge > 24h then alert(gerente, telegram)`
- [ ] **Delta/Comparativa** — "este cliente abriu 3 tickets esta semana, semana passada foram 0"
- [ ] **Catálogo de templates** de respostas reutilizáveis entre tenants
- [ ] Importação de contatos do WhatsApp Business

### Fase 4 — Integração AllHub real (semanas 5+)
- [ ] Reimplementar `FunctionTemplate` / `ServiceTemplate` (catálogo de regras Integrim) **em Node**
- [ ] Conexão OAuth Integrim no `all-assist` (reuso do conhecimento do CRM)
- [ ] Multi-agente coordenador (Fiscal, SQL, Estoque, etc.) na mesma ferramenta
- [ ] Importação do conhecimento acumulado no AllHub (EXEMPLOS-DE-USO.md, prompts)
- [ ] Voice agents (atendimento por voz via WhatsApp)

---

## Arquitetura técnica

### Stack
| Camada | Tecnologia |
|---|---|
| Backend | Node.js >= 20, raw `http.createServer` (sem framework) |
| Persistência | JSON file via `CrmDataStore` (migrar pra Postgres se ficar crítico) |
| Frontend | Vanilla JS + CSS sem build step |
| Auth | Sessão cookie (`allassist_session`) |
| IA | Claude API direto via `fetch`/`requestJson` — Haiku 4.5 default |
| Multi-tenant | Resolução por host (subdomínio OU CNAME customizado) |
| Deploy | AWS ECS Fargate, ECR, GitHub Actions OIDC |
| Região | `sa-east-1` (São Paulo) |

### White-label SaaS multi-tenant

Cada tenant tem:
```json
{
  "id": "tenant_xxx",
  "slug": "empresa-cliente",
  "displayName": "Atendimento Cliente XYZ",
  "primaryColor": "#FF6B00",
  "logoUrl": "https://...",
  "customDomain": "atende.cliente.com.br",
  "metaWhatsApp": { ... },
  "evolutionInstance": "..."
}
```

Resolução de tenant em `src/tenantContext.js`:
1. Olha `request.headers.host`
2. Se é `*.allassist.com.br` → extrai slug → tenant
3. Se é domínio custom → busca tenant onde `customDomain === host`
4. Master users podem switch via cookie `allassist_active_tenant`

Frontend recebe config do tenant ativo via endpoint `/api/branding` e renderiza nome, cor, logo dinamicamente.

### Estrutura de Ticket (proposta inicial)

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
  slaDueAt: "2026-05-25T15:00:00Z",
  openedAt: "...",
  firstResponseAt: "..." | null,
  closedAt: "..." | null,
  closedBy: "us_xxx" | null,
  closureNote: "...",
  aiClassification: {
    model: "claude-haiku-4-5-20251001",
    confidence: 0.92,
    reasoning: "...",
    classifiedAt: "..."
  },
  logs: [ ... ]
}
```

### Agente IA Classificador (MVP)

- Modelo: **Claude Haiku 4.5** (`claude-haiku-4-5-20251001`)
- Trigger: webhook WhatsApp recebe primeira mensagem → cria ticket → chama classificador antes de salvar
- Output estruturado: `{ category, priority, subject, reasoning, confidence }`
- Custo estimado: ~$0.001 por classificação
- Prompt em `src/agents/classifier.js` versionado

---

## Comandos

```bash
# Iniciar o servidor (porta 3000 por padrão)
node src/platform.js

# Rodar testes
node --test

# Rodar teste específico
node --test test/tenantIsolation.test.js

# Smoke test do frontend (carrega public/app.js num DOM falso e verifica
# que o boot não toca elementos removidos) — rode após mexer no app.js
node test/smoke-frontend.mjs

# Popular atendimentos de exemplo para visualizar a Central (idempotente).
# Pare o servidor/container antes; suba depois. Limpa o que criou ao rerodar.
node scripts/seed-demo.mjs
```

Copie `.env.example` para `.env` antes de rodar. Requer Node.js >= 20.

---

## Variáveis de ambiente (chaves principais)

```env
# Auth bootstrap
ALLASSIST_BOOTSTRAP_ADMIN_EMAIL=admin@allassist.local
ALLASSIST_BOOTSTRAP_ADMIN_PASSWORD=admin123
ALLASSIST_BOOTSTRAP_MASTER_EMAIL=master@allassist.local
ALLASSIST_BOOTSTRAP_MASTER_PASSWORD=master123

# SaaS
SAAS_BASE_DOMAIN=allassist.com.br

# Meta WhatsApp Cloud API
META_PHONE_NUMBER_ID=
META_ACCESS_TOKEN=
META_WABA_ID=
META_APP_SECRET=
META_VERIFY_TOKEN=
META_GRAPH_VERSION=v23.0

# Evolution API (compartilhada com CRM)
EVOLUTION_API_URL=https://evo.allassist.com.br
EVOLUTION_API_KEY=

# Claude API (classificador)
ANTHROPIC_API_KEY=
CLASSIFIER_MODEL=claude-haiku-4-5-20251001

# Telegram (alertas)
TELEGRAM_BOT_TOKEN=
```

---

## Deploy (AWS ECS Fargate)

Padrão a ser espelhado do `fly-crm-platform`:

- **Repositório GitHub:** `andersonallconsultoria/all-assist` (a criar)
- **AWS region:** `sa-east-1` (São Paulo)
- **ECR:** `allassist-platform`
- **ECS cluster:** `allassist-cluster` / service: `allassist-platform-service`
- **Task definition:** `infra/ecs/task-definition.json` — family: `allassist-platform`
- **IAM task role:** `allassistTaskRole` / execution: `ecsTaskExecutionRole`
- **Domínio principal:** `allassist.com.br` (a comprar)
- **ALB:** suportar SAN para múltiplos domínios de clientes
- **CI/CD:** GitHub Actions OIDC (espelhar `.github/workflows/deploy-ecs.yml` do CRM)

---

## Decisões importantes já tomadas (com Anderson em 2026-05-23)

1. **Nome final:** ALL Assist (não ALL Atendimento, não ALL Atende)
2. **Multi-tenant white-label SaaS** desde o dia 1 — cada cliente personaliza marca e domínio
3. **Stack única Node.js** — AllHub Python NÃO será fundido. Suas ideias serão reimplementadas em Node aqui
4. **Fork direto** ao invés de monorepo — monorepo só quando 2 ferramentas estiverem maduras
5. **Reuso de infra Evolution API** existente — mesma instância `evo.allassist.com.br` por enquanto
6. **Reuso de número WhatsApp** atual (mesma config Meta) pra fase de testes; em produção cada cliente terá seu próprio número
7. **MVP até segunda inclui IA classificador** — não nasce só como ticket sem IA
8. **Persistência JSON file** mantida do CRM por enquanto — migrar pra Postgres só quando justificar
9. **Anti-ban Evolution** — manter a estrutura de proteção do CRM (aquecimento, intervalos, etc.)

---

## Referências de outros projetos do mesmo dono

- **Fly CRM / ALL Assist:** `c:\Projetos Dev\fly-crm-platform` — código-base original deste fork
- **AllHub:** `c:\Projetos Dev\allhub` — projeto Python/FastAPI cujas IDEIAS serão reimplementadas aqui em Node (Fases 3-4)
- **Fluxo de Caixa:** `c:\Projetos Dev\Fluxo_Caixa` — projeto Next.js separado (não relacionado)
- **CISS Vidroweb Integration:** `c:\Projetos Dev\ciss_vidroweb_integration` — integração ERP separada

---

## Para o Claude que vai trabalhar aqui

Leia este CLAUDE.md inteiro **antes** de começar qualquer alteração. O contexto está todo aqui.

Se faltar algo, **pergunte ao Anderson** antes de inferir. Ele prefere alinhamento curto a retrabalho longo.

**Não mexa em:** `c:\Projetos Dev\fly-crm-platform` — esse é o CRM ALL que continua existindo em paralelo.
