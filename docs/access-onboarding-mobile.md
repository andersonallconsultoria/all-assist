# Cargos, Convites, Google e Mobile

## Cargos e permissoes

O Fly CRM passa a tratar cargo como um perfil de acesso configuravel por cliente SaaS.

Exemplos:

```text
Administrador
Supervisor Comercial
Consultor de Vendas
Vendedor Externo
Operador de Atendimento
```

Cada cargo possui:

```text
tenantId
name
type
permissions
```

Catalogo inicial de modulos:

```text
Inicio
Relatorios
CRM
Conversas WhatsApp
Produtos e estoque
Usuarios e cargos
Integracoes ERP
```

## Convite de usuario

Fluxo planejado:

1. Admin cria cargo.
2. Admin convida usuario por email.
3. Sistema gera link de convite.
4. Usuario abre o link e cria senha.
5. Sistema envia email de validacao.
6. Usuario clica no link de validacao.
7. Conta fica ativa.

Enquanto o email nao for validado, o status fica:

```text
pending_email_verification
```

Depois de validar:

```text
active
```

## Login com Google

Estrutura preparada:

```text
oauthIdentities
```

Campos principais:

```text
provider: google
providerUserId
userId
email
emailVerified
```

No fluxo final, o Google valida a identidade e o Fly CRM vincula essa conta externa ao usuario.

## APIs iniciais

```text
GET  /api/permissions/catalog
POST /api/roles
POST /api/users/invites
POST /api/auth/invites/accept
POST /api/auth/email/verify
```

Observacao: enquanto nao houver servico de email real, o ambiente de desenvolvimento pode retornar o link/token para teste. Em producao, o token deve ir por email e nao ficar exposto na tela/API.

Paginas publicas iniciais:

```text
/accept-invite.html
/verify-email.html
```

## Mobile

O caminho recomendado e comecar como PWA responsivo:

```text
Web app responsivo
Instalavel no celular
Mesmo backend e mesmas permissoes
Offline parcial no futuro
```

Base PWA criada:

```text
/manifest.webmanifest
/service-worker.js
/icon.svg
```

Depois, se precisar de recursos nativos fortes, o melhor caminho e criar um app com:

```text
React Native + Expo
```

Motivo:

- reaproveita a linguagem JavaScript/TypeScript;
- evolui rapido;
- permite camera, notificacoes push, armazenamento local e biometria;
- conversa com a mesma API do Fly CRM.

Primeiro foco mobile:

```text
Pedidos e orcamentos do vendedor
Agenda de proximos contatos
Registro rapido de contato
Dashboard simples do vendedor
Conversas WhatsApp
Consulta de produto e estoque online
```
