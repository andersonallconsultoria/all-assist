# CRM proprio integrado ao ERP

## Objetivo

Construir uma plataforma propria para controlar orcamentos, pedidos e atendimentos comerciais conectados ao ERP.

O foco inicial e resolver o problema que a DKW nao atendeu bem:

- um cliente pode ter varios pedidos/orcamentos;
- todos podem ter o mesmo telefone;
- cada `idempresa:idorcamento` precisa ser um negocio separado;
- o contato deve ser unico por telefone;
- os dados do pedido devem ficar no negocio, nao no contato.

## Modulos iniciais

### Integracao ERP

Mantem a autenticacao e busca pelo conector ERP configurado. O primeiro conector implementado e o CISS.

No CRM proprio:

- cria/reaproveita o contato pelo telefone;
- cria/atualiza negocio pela chave `idempresa:idorcamento`;
- nao mistura varios pedidos no mesmo negocio;
- salva campos do pedido em `deal.customFields`.

### CRM de pedidos e orcamentos

Entidades:

- `contacts`: clientes.
- `deals`: negocios/pedidos/orcamentos.
- `dealLogs`: historico de contato, anotacoes e proxima acao.
- `syncRuns`: historico das sincronizacoes.

### WhatsApp oficial Meta

Entidades:

- `conversations`: atendimentos.
- `messages`: mensagens inbound/outbound.

Entrada:

- `GET /webhooks/meta/whatsapp`: verificacao do webhook da Meta.
- `POST /webhooks/meta/whatsapp`: recebe mensagens e cria conversa.

Saida:

- `POST /api/conversations/{id}/messages`: envia mensagem usando Cloud API se configurada.

## Portal

O portal inicial fica em `/` e possui:

- painel;
- pedidos e orcamentos;
- conversas WhatsApp;
- clientes;
- usuarios e perfis;
- botao para sincronizar ERP manualmente.

## Login e permissoes

O Fly CRM possui login local com sessao em cookie HTTP-only.
As senhas sao salvas com hash `scrypt`.

No primeiro boot, o sistema cria:

- perfil `Administrador`, com todas as permissoes;
- perfil `Vendedor`, com acesso operacional;
- usuario admin definido no `.env`.

Configuracao:

```env
ALLASSIST_BOOTSTRAP_ADMIN_NAME=Administrador
ALLASSIST_BOOTSTRAP_ADMIN_EMAIL=admin@allassist.local
ALLASSIST_BOOTSTRAP_ADMIN_PASSWORD=admin123
ALLASSIST_SESSION_SECRET=change-this-secret
ALLASSIST_SESSION_TTL_HOURS=12
```

Permissoes iniciais:

- `dashboard:view`
- `contacts:view`
- `deals:view`
- `deals:write`
- `conversations:view`
- `conversations:write`
- `users:view`
- `users:write`
- `settings:manage`

Importante: trocar `ALLASSIST_BOOTSTRAP_ADMIN_PASSWORD` e `ALLASSIST_SESSION_SECRET` antes de qualquer ambiente real.

## Como rodar o portal local

Configure `.env` com os dados do ERP e rode:

```bash
npm run serve
```

Para uma sincronizacao unica sem portal:

```bash
npm run sync:local
```

## Status atual validado

Com os 3 pedidos de teste do conector ERP atual:

- contatos criados: 1;
- negocios criados: 3;
- todos vinculados ao mesmo contato;
- cada negocio com sua chave externa propria:
  - `1:98438`
  - `1:98439`
  - `1:98443`

Isso confirma que, no CRM proprio, resolvemos o problema de multiplos pedidos para o mesmo telefone.
