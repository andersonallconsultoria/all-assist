# Painel Master SaaS

O painel master fica separado do CRM operacional:

```text
/master.html
```

Esse painel e usado pela Fly Gestao para controlar clientes SaaS, planos, cobranca, limites, acessos, integracoes, WhatsApp e LGPD.

## Fluxo de trabalho

1. Acesse `/master.html`.
2. Entre com usuario master.
3. Cadastre o cliente SaaS.
4. Configure plano, cobranca, limite de usuarios e WhatsApp.
5. Abra `Estrutura e acessos` para criar grupos de CNPJ, lojas, vendedores, supervisores, cargos e convites.
6. Clique em `Acessar` para entrar no ambiente do cliente.
7. Dentro do CRM operacional, configure ERP e acompanhe pedidos/orcamentos daquele tenant.

Tambem e possivel acessar pela tela normal de login. Quando o usuario possui perfil master, o Fly CRM redireciona automaticamente para `/master.html`.

## Controle de acesso

Cada cliente possui:

```text
status: active | trial | paused | blocked
billingStatus: active | trial | overdue | suspended | canceled
userLimit: numero maximo de usuarios ativos
```

Regras iniciais:

- `blocked` bloqueia acesso do cliente.
- `suspended` bloqueia acesso do cliente.
- `overdue` sinaliza atraso, mas ainda permite acesso.
- `userLimit` limita novos usuarios criados dentro do tenant.
- usuario master continua acessando tenants bloqueados para suporte.

## Cobranca

Campos iniciais:

```text
monthlyBasePrice
pricePerUser
billingDay
billingEmail
```

Receita estimada:

```text
monthlyBasePrice + activeUsers * pricePerUser
```

## WhatsApp por cliente

Cada tenant pode ter configuracao propria:

```text
whatsapp.phoneNumber
whatsapp.phoneNumberId
whatsapp.businessAccountId
whatsapp.status
```

Isso prepara o caminho para cada cliente ter seu numero oficial da Meta Cloud API.

## Estrutura e acessos

A aba `Estrutura e acessos` concentra a configuracao operacional do cliente:

```text
Grupo de CNPJs
Empresa/CNPJ com codigo do ERP
Vendedor ou supervisor com codigo ERP
Cargo com permissoes por modulo
Convite de usuario com validacao de email
```

O objetivo e suportar clientes simples, com um unico CNPJ, e clientes maiores, com varios grupos de lojas dentro do mesmo SaaS.

Exemplos de uso:

- vendedor acessa apenas os pedidos vinculados ao seu codigo ERP;
- supervisor acompanha apenas os vendedores do seu grupo;
- administrador do cliente acessa todos os CNPJs;
- suporte master entra no ambiente do cliente para diagnostico.

APIs usadas pela tela:

```text
GET  /api/support/tenants/{tenantId}/structure
POST /api/support/tenants/{tenantId}/groups
POST /api/support/tenants/{tenantId}/companies
POST /api/support/tenants/{tenantId}/sales-people
GET  /api/permissions/catalog
POST /api/roles
POST /api/users/invites
```

## LGPD

Campos iniciais por tenant:

```text
lgpd.dpoName
lgpd.dpoEmail
lgpd.retentionDays
lgpd.consentRequired
lgpd.dataProcessingAgreementSigned
```

Proximos passos de LGPD:

- termo de uso e politica de privacidade aceitos por usuario;
- trilha de auditoria de acesso a dados pessoais;
- rotina de exportacao/anomizacao por titular;
- retencao automatica por tenant;
- consentimento por contato quando aplicavel.

## Alertas Telegram

Configuracao por variavel de ambiente:

```env
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
TELEGRAM_NOTIFY_SERVER_ERRORS=true
TELEGRAM_NOTIFY_INTEGRATION_FAILURES=true
```

Quando configurado, falhas criticas do servidor e de integracao podem gerar alerta em um grupo do Telegram.
