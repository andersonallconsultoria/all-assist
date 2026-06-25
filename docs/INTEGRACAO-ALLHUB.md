# Integração nativa: Freitas Assist (ALL Assist) ↔ AllHub

Documento de arquitetura + dois prompts prontos para repassar a agentes de IA
(um para alinhar a visão, outro técnico para o agente do AllHub desenhar a
"conversa de dados"/contrato de API).

---

## Visão em uma frase

O **Freitas Assist** é a camada de **atendimento** (WhatsApp, tickets, analistas,
clientes, base de conhecimento). O **AllHub** é a camada de **inteligência de ERP**
(agentes especialistas em CISS-Poder/INTEGRIM). A integração faz os agentes do
AllHub **apoiarem o analista durante o atendimento** — e, no futuro, responderem
o cliente sob aprovação — com todo o conhecimento técnico que acumulam.

```
Cliente (WhatsApp)
      │
      ▼
┌──────────────────────┐      pergunta + contexto + cliente       ┌──────────────────────┐
│   FREITAS ASSIST     │  ─────────────────────────────────────▶  │       ALLHUB         │
│  (atendimento)       │                                          │  (agentes IA CISS)   │
│                      │  ◀─────────────────────────────────────  │                      │
│  analista revisa  ◀──┘      resposta + agente + fontes + ações  └──┐ consulta CISS-Poder│
└──────────────────────┘                                            └────────────────────┘
```

---

# PROMPT 1 — Contexto do Freitas Assist e a visão da integração

> Cole este bloco para dar a qualquer agente/pessoa o entendimento completo da
> ferramenta de atendimento e do que queremos construir.

```
Você vai ajudar a integrar duas ferramentas do mesmo dono (Anderson, consultor
de ERP CISS-Poder).

FERRAMENTA 1 — FREITAS ASSIST (ALL Assist)
Plataforma SaaS white-label de ATENDIMENTO AO CLIENTE VIA WHATSAPP com tickets e
IA. Stack: Node.js (http puro, sem framework), persistência JSON (CrmDataStore),
frontend vanilla JS, WhatsApp via Evolution API (Baileys/QR) e/ou Meta Cloud API.
Multi-tenant por tenant.

Entidades principais (campos reais):
- Contato (contact): id, tenantId, name, phone (E.164 BR), whatsappJid, avatarUrl,
  email, city, tags[], customerId (vínculo ao cliente/empresa), source.
- Cliente/empresa (customer): id, name, fantasia, cnpj, ie, uf, regime,
  atividade, hourlyBilling (cobrança por horas), notes. (É a empresa atendida —
  a chave para o ERP é o CNPJ.)
- Atendimento/Ticket (ticket): id, tenantId, contactId, conversationId,
  assignedAnalystId, status (open/waiting_customer/waiting_analyst/closed),
  priority (low/medium/high/critical), category (support/question/complaint/
  compliment/sales/other), subject, queue (fila/setor escolhido pelo cliente no
  menu, ex.: "Suporte Contábil/Fiscal"), aiClassification, openedAt, closedAt,
  timeTracking (cronômetro de horas).
- Conversa (conversation) + mensagens (message): direction in/out, type
  (text/audio/image/video/document), body, mediaId, status (sent/delivered/read).
- Base de conhecimento (kbArticle): title, category, content, attachments[]
  (com name e textExtract — texto extraído de PDFs por IA).
- Usuário/analista (user) com perfil de acesso (role) que libera menus por
  permissão.

O que a ferramenta já tem hoje:
- Recebe e responde WhatsApp real (texto, áudio, imagem, documento).
- Bot de saudação + menu inicial (numerado) que DIRECIONA o atendimento para uma
  FILA/setor conforme o cliente escolhe.
- Classificador IA (Claude Haiku) que categoriza e prioriza o ticket.
- "Apoio da base" — sugere conteúdo da base de conhecimento ao analista.
- Cofre de acessos por cliente (credenciais/conexões, AES-256-GCM).
- Controle de horas por atendimento e relatórios.
- Atribuição/assunção de atendimento, tags, despedida automática.

FERRAMENTA 2 — ALLHUB
Camada de inteligência de ERP. Tem (ou terá) vários AGENTES ESPECIALISTAS de IA
em CISS-Poder/INTEGRIM (Fiscal, SQL/banco DB2, Estoque, Financeiro/Fluxo de
Caixa, Contábil, etc.). Cada agente acumula conhecimento técnico e sabe
consultar/atuar no ERP do cliente (via API CISS-Poder e/ou banco DB2 do cliente).
Roda em Python/FastAPI.

O QUE QUEREMOS (a integração nativa):
Durante um atendimento no Freitas Assist, quando o assunto é técnico de ERP
(ex.: "minha nota fiscal deu erro de rejeição", "o saldo bancário está
divergente", "como gero o SPED"), o analista (ou o bot) deve poder ACIONAR o
agente especialista certo do AllHub, que:
  1. recebe o CONTEXTO do atendimento (histórico da conversa + qual cliente/CNPJ),
  2. roteia para o agente especialista adequado,
  3. consulta seu conhecimento + os dados do ERP daquele cliente,
  4. devolve uma RESPOSTA/sugestão (e, quando aplicável, AÇÕES propostas no ERP),
  5. o analista REVISA e responde o cliente (aprovação humana obrigatória).

Princípios herdados da tese do AllHub que valem aqui:
- Modo híbrido por agente: automático, manual (clique), conversacional.
- Aprovação humana obrigatória em ações que alteram o ERP (IA propõe → analista
  aprova → executa).
- O conhecimento que os agentes adquirem deve realimentar a base e os próximos
  atendimentos (documentação viva).

PONTO CRÍTICO — A BASE DE CONHECIMENTO É, EM GRANDE PARTE, ALIMENTADA PELOS
AGENTES DO ALLHUB. Hoje a base de conhecimento do Freitas Assist é preenchida à
mão (artigos/FAQ/PDFs). Com a integração, a MAIOR PARTE do conteúdo passará a vir
dos agentes especialistas: cada vez que um agente resolve um caso de ERP
(rejeição de NF-e, divergência de saldo, geração de SPED, ajuste de estoque...),
esse aprendizado deve virar um ARTIGO na base de conhecimento do Freitas Assist —
categorizado, reutilizável e pesquisável. Assim:
  - o "Apoio da base" do atendimento fica cada vez mais inteligente sem trabalho
    manual;
  - analistas resolvem casos repetidos sem reacionar o agente;
  - o bot inicial passa a responder dúvidas frequentes com base nesse conteúdo.
A base de conhecimento é, portanto, o REPOSITÓRIO COMPARTILHADO de conhecimento
entre as duas ferramentas — o AllHub escreve nela continuamente; o Freitas Assist
a consome no atendimento.

OBJETIVO FINAL: os agentes do AllHub apoiam os analistas em todo atendimento (e,
numa fase seguinte e configurável, podem responder o cliente diretamente pelo bot
quando a confiança for alta e o tema permitir).
```

---

# PROMPT 2 — Briefing técnico para o agente do AllHub (desenhar o contrato)

> Cole este bloco no agente/dev do AllHub. Ele descreve o que o Freitas Assist
> precisa e PEDE que o AllHub proponha o melhor contrato de API ("conversa de
> dados") — endpoints, payloads, autenticação, modos síncrono/assíncrono.

```
Contexto: já existe um briefing da ferramenta de atendimento (Freitas Assist).
Agora preciso que VOCÊ (lado AllHub) proponha o CONTRATO DE INTEGRAÇÃO entre as
duas ferramentas — a "conversa de dados" — pensando na melhor arquitetura.

Papéis:
- Freitas Assist = CLIENTE da integração (faz as chamadas; orquestra o
  atendimento e a aprovação humana).
- AllHub = SERVIDOR da integração (expõe os agentes especialistas CISS-Poder).

Quero que você proponha e justifique:

1) AUTENTICAÇÃO E MULTI-TENANT
   - Como o Freitas Assist se autentica no AllHub (API key por tenant? OAuth2
     client-credentials, alinhado ao cisspoder-auth?).
   - Como amarramos o "cliente/empresa" do Freitas Assist (que tem CNPJ) à
     empresa no CISS-Poder (IDEMPRESA/idempresa). Mapa CNPJ → IDEMPRESA fica no
     AllHub? Enviamos o CNPJ e vocês resolvem?

2) DESCOBERTA DE AGENTES
   - Endpoint para listar os agentes especialistas disponíveis e suas
     capacidades/escopos (ex.: GET /agents → [{key, nome, descrição, temas,
     exemplos, precisa_aprovacao}]). O Freitas Assist usaria isso para montar o
     menu de "acionar especialista" e para roteamento automático por tema.

3) A CHAMADA PRINCIPAL — "perguntar a um especialista"
   Proponha o endpoint (ex.: POST /assist) e o PAYLOAD que o Freitas Assist
   enviaria. Sugestão de campos a receber (ajuste como achar melhor):
     {
       "tenant": "...",                  // identifica o tenant do Freitas Assist
       "cliente": { "cnpj": "...", "nome": "...", "uf": "...", "regime": "..." },
       "atendimento": {
         "ticketId": "...",
         "fila": "Suporte Contábil/Fiscal",
         "assunto": "...",
         "prioridade": "high"
       },
       "conversa": [                     // histórico recente (para contexto)
         {"de": "cliente", "texto": "minha NF-e deu rejeição 539", "ts": "..."},
         {"de": "analista", "texto": "...", "ts": "..."}
       ],
       "pergunta": "texto livre do analista OU a última mensagem do cliente",
       "modo": "apoio_analista" | "resposta_cliente",
       "agente": "auto" | "fiscal" | "sql" | "estoque" | "financeiro" | ...
     }

   E o RETORNO. Sugestão de campos:
     {
       "agente": "fiscal",
       "resposta": "texto pronto para o analista revisar/enviar",
       "confianca": 0.0-1.0,
       "fontes": [ ... ],               // do que a resposta foi derivada
       "acoes_propostas": [             // quando há ação no ERP (pending)
         {"id":"...", "descricao":"reprocessar a NF-e X", "requer_aprovacao":true,
          "payload_execucao": { ... }}
       ],
       "aprendizado": "resumo a salvar na base de conhecimento (opcional)"
     }

4) APROVAÇÃO E EXECUÇÃO DE AÇÕES
   - Como o Freitas Assist confirma uma ação proposta (ex.: POST /actions/{id}/
     approve) e como o AllHub reporta o resultado.
   - Toda ação que altera o ERP deve passar por aprovação humana no Freitas
     Assist antes de executar.

5) SÍNCRONO vs ASSÍNCRONO
   - Quando a consulta é rápida → resposta síncrona.
   - Quando o agente precisa consultar o ERP/processar → recomenda webhook de
     retorno? (Freitas Assist exporia POST /webhooks/allhub para receber a
     resposta quando ficar pronta, citando o ticketId.) Proponha o melhor modelo.

6) BASE DE CONHECIMENTO ALIMENTADA PELOS AGENTES (PONTO MAIS IMPORTANTE)
   A base de conhecimento do Freitas Assist será, em grande parte, ESCRITA pelos
   agentes do AllHub. Quero que você desenhe esse fluxo de conhecimento:
   - PUSH contínuo: o AllHub deve poder ENVIAR artigos para a base do Freitas
     Assist sempre que um agente aprender/resolver algo novo — não só ao fim de
     um atendimento, mas também em modo automático (cron) e manual. Proponha o
     endpoint que o Freitas Assist exporia, ex.: POST /api/kb/from-allhub.
   - Formato do artigo: { title, category, content (markdown), tags[],
     agente_origem, tema_cisspoder, exemplos[], cnpj_cliente? (se específico do
     cliente) | global, confianca, refs[] }.
   - Categorização e DEDUPLICAÇÃO/VERSIONAMENTO: como evitar artigos duplicados e
     como ATUALIZAR um artigo existente quando o agente refina o conhecimento
     (chave de identidade do artigo? versão? merge?).
   - Escopo: distinguir conhecimento GLOBAL (vale para qualquer cliente, ex.:
     "como resolver rejeição 539 da NF-e") de conhecimento ESPECÍFICO de um
     cliente (ex.: particularidades fiscais daquele CNPJ).
   - Curadoria: o artigo entra publicado ou como RASCUNHO para um humano aprovar?
     (sugiro rascunho quando confiança < limiar.)
   - Retroalimentação: quando o "Apoio da base" usa um artigo num atendimento e
     ele resolve (ou não) o caso, vale enviar esse sinal de volta ao AllHub para
     o agente melhorar? Proponha.
   Objetivo: a base de conhecimento vira o REPOSITÓRIO COMPARTILHADO — o AllHub
   escreve, o Freitas Assist consome no atendimento (bot, apoio ao analista).

7) NÃO-FUNCIONAIS
   - Timeouts, retries, idempotência (mesma pergunta não dispara ação duas
     vezes), versionamento da API, e como tratar erros do CISS-Poder
     (ERRO_SISTEMA) de forma legível para o analista.

Entregue: a especificação do contrato (endpoints + payloads + auth + fluxos
síncrono/assíncrono + exemplos), justificando as escolhas. Não precisa
implementar agora — preciso da proposta da "conversa de dados" para revisarmos
juntos antes de codar dos dois lados.
```

---

## Notas de implementação do lado do Freitas Assist (para quando formos codar)

- Criar um `allhubClient.js` (igual ao `evolutionApiClient.js`/`whatsappMetaClient.js`)
  com os métodos do contrato definido.
- Config por tenant: `tenant.allhub = { baseUrl, apiKey, enabled }`.
- No atendimento: botão **"Pedir ao especialista"** (ao lado de "Apoio da base"),
  que monta o payload com o histórico + o cliente vinculado (CNPJ) e mostra a
  resposta como sugestão (o analista edita/envia — aprovação humana).
- Reusar o cofre/cliente: o CNPJ do `customer` é a chave para o AllHub resolver a
  empresa no CISS.
- Ações propostas viram um painel de aprovação (pending → aprovar → executar).
- **Ingestão de conhecimento (prioritário):** expor `POST /api/kb/from-allhub`
  para o AllHub fazer push de artigos para a base de conhecimento. A coleção
  `kbArticles` já existe (title, category, content, attachments com textExtract);
  basta acrescentar campos de origem (`agenteOrigem`, `temaCisspoder`,
  `escopo: global|cliente`, `cnpj`, `versao`, `confianca`) e uma rotina de
  dedupe/atualização. Artigos com confiança baixa entram como rascunho para
  curadoria. O "Apoio da base" e o bot passam a usar esse acervo automaticamente.
- A base de conhecimento é o ponto de maior volume da integração: planejar
  paginação, busca e versionamento desde o início.
