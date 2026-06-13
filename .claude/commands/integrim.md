# Skill: Integração Integrim ERP

Configura, testa e documenta a integração com o ERP via aplicativo **Integrim** (padrão Fly Gestão).

## Padrão de integração Integrim

Todas as aplicações Fly Gestão que usam o Integrim seguem **exatamente este padrão**:

### 1. Geração de token OAuth (sempre igual)

```
POST http://{IP}:{PORTA}/cisspoder-auth/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=password
client_id=cisspoder-oauth
client_secret=poder7547
username={USUARIO_DO_CLIENTE}
password={SENHA_DO_CLIENTE}
```

**Resposta esperada:**
```json
{ "access_token": "eyJ...", "token_type": "Bearer", "expires_in": 3600 }
```

### 2. O que muda entre clientes

| Variável | Valor padrão | O que muda |
|---|---|---|
| `CISS_BASE_URL` | `http://IP:PORTA` | IP e porta por cliente |
| `CISS_USERNAME` | — | Usuário por cliente |
| `CISS_PASSWORD` | — | Senha por cliente |
| `CISS_CLIENT_ID` | `cisspoder-oauth` | **Nunca muda** |
| `CISS_CLIENT_SECRET` | `poder7547` | **Nunca muda** |

### 3. Endpoint de dados (exemplo: gestão de vendas)

```
POST http://{IP}:{PORTA}/cisspoder-service/crm/gestao_vendas
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "limit": 1000,
  "page": 1,
  "clausulas": [
    { "campo": "dtini", "operadorlogico": "AND", "operador": "IGUAL", "valor": "2024-01-01" },
    { "campo": "dtfim", "operadorlogico": "AND", "operador": "IGUAL", "valor": "2024-12-31" },
    { "campo": "idempresa", "operadorlogico": "AND", "operador": "IGUAL", "valor": 1 }
  ]
}
```

**Padrão de resposta:**
```json
{ "data": [...], "total": 500, "hasNext": false }
```

### 4. Variáveis de ambiente no .env

```env
CISS_BASE_URL=http://177.155.113.220:4665
CISS_USERNAME=usuario_do_cliente
CISS_PASSWORD=senha_do_cliente
CISS_CLIENT_ID=cisspoder-oauth
CISS_CLIENT_SECRET=poder7547
CISS_IDEMPRESA=1
CISS_PAGE_LIMIT=1000
CISS_LOOKBACK_DAYS=30
CISS_LOOKAHEAD_DAYS=180
```

### 5. Como testar a conexão

Com o servidor rodando (`node src/platform.js`), usar o botão **"Testar conexão"** na tela de Integração ERP, ou via curl:

```bash
curl -X POST http://177.155.113.220:4665/cisspoder-auth/oauth/token \
  -d "grant_type=password&client_id=cisspoder-oauth&client_secret=poder7547&username=SEU_USER&password=SUA_SENHA"
```

### 6. Como sincronizar manualmente

Pela interface: botão **"Sincronizar ERP"** na sidebar.

Via API:
```bash
curl -X POST http://localhost:3000/api/erp/sync/run \
  -H "Cookie: neuraxcrm_session=SEU_TOKEN"
```

Via terminal (sem servidor web):
```bash
node src/platform.js --sync-once
```

## Instrução de uso desta skill

Quando o usuário pedir para configurar ou ajustar a integração com o Integrim em qualquer projeto:

1. Verificar se `.env` existe — se não, copiar de `.env.example`
2. Atualizar `CISS_BASE_URL` com o IP e porta do cliente
3. Preencher `CISS_USERNAME` e `CISS_PASSWORD` do cliente
4. Manter `CISS_CLIENT_ID=cisspoder-oauth` e `CISS_CLIENT_SECRET=poder7547` (invariáveis)
5. Testar a conexão antes de ativar o scheduler
6. O arquivo `src/cissClient.js` implementa o cliente — para novos projetos, copiar esse arquivo como base
