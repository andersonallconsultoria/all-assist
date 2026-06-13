# Fly CRM - Gestao Comercial Integrada

CRM proprio para controlar orcamentos, pedidos, follow-up comercial e conversas WhatsApp, mantendo integracao com ERPs.

O projeto nasceu dos testes com DKW/FlyGestao, mas agora o caminho principal e `CRM_PROVIDER=local`, usando nossa propria base e portal.

Servico para consultar pedidos/orcamentos no ERP e sincronizar com o CRM. O primeiro conector implementado e o CISS, mas a plataforma deve tratar isso como integracao ERP generica.

Fluxo atual:

1. Autentica no ERP pelo conector configurado.
2. Busca pedidos em `/cisspoder-service/crm/gestao_vendas`.
3. Normaliza telefone, cliente, valor, vendedor e status.
4. Cria/reaproveita contato pelo telefone.
5. Cria/atualiza um negocio separado por `idempresa:idorcamento`.
6. Salva campos do pedido no negocio.
7. Expoe portal web, API local, suporte master e webhooks WhatsApp Meta.

## Como rodar local

```bash
cp .env.example .env
npm test
npm run sync:local
npm run serve
```

No Windows, crie `.env` copiando o conteudo de `.env.example`.

O portal fica em:

```text
http://127.0.0.1:3000
```

## Scripts

- `npm run serve`: sobe o portal/API e sincroniza em ciclo.
- `npm run sync:local`: executa uma sincronizacao ERP -> CRM proprio e encerra.
- `npm run run:once`: modo legado DKW/FlyGestao.
- `npm test`: testes automatizados.

## Login inicial

O Fly CRM cria um usuario admin no primeiro boot conforme `.env`:

```env
NEURAXCRM_BOOTSTRAP_ADMIN_EMAIL=admin@neuraxcrm.local
NEURAXCRM_BOOTSTRAP_ADMIN_PASSWORD=admin123
```

Troque essa senha antes de usar fora de teste.

Usuario master/suporte, quando configurado no `.env`:

```env
NEURAXCRM_BOOTSTRAP_MASTER_EMAIL=master@neuraxcrm.local
NEURAXCRM_BOOTSTRAP_MASTER_PASSWORD=master123
```

Esse perfil acessa a tela `Suporte Master`, com tenants, historico de integracao, metricas de requisicao, logs e eventos.

## Pontos importantes

- A base do CRM proprio fica em `CRM_DATA_FILE`, por padrao `data/crm.json`.
- O estado legado DKW fica em `STATE_FILE`.
- A tela `Integracao ERP` permite configurar IP/host, porta, usuario, senha, client ID, client secret e empresa sem editar `.env`.
- As variaveis `CISS_*` continuam como padrao inicial do primeiro conector ERP, mas podem ser sobrescritas pela tela.
- Os logs sao JSON estruturados no console e, se `LOG_FILE` estiver definido, tambem em arquivo.
- `POLL_INTERVAL_MS=60000` faz rodar a cada minuto.
- `DRY_RUN=true` executa a leitura do ERP e mostra o que seria enviado, sem chamar CRM.
- `FORCE_RESYNC=true` ignora o hash salvo e tenta sincronizar tudo novamente.
- `CRM_FAIL_ON_REUSED_ORDER_ID=true` evita sobrescrever o mesmo negocio com pedidos ERP diferentes.

## WhatsApp Meta

O CRM possui base para WhatsApp oficial Meta Cloud API:

- `GET /webhooks/meta/whatsapp`: verificacao da Meta.
- `POST /webhooks/meta/whatsapp`: recebimento de mensagens.
- `POST /api/conversations/{id}/messages`: envio de mensagem pelo CRM.

Veja [docs/meta-whatsapp.md](D:/projeto_dkw_crm/docs/meta-whatsapp.md).

## Deploy AWS Fargate

O passo a passo para publicar em `crm.neurax.com.br` com ECS Fargate, ECR, ALB, ACM, DNS e EFS esta em [docs/deploy-aws-fargate.md](docs/deploy-aws-fargate.md).

## Deploy automatico com GitHub Actions

O projeto possui workflow para publicar novas versoes no ECS Fargate apos push na branch `main`.

Veja [docs/github-cicd.md](D:/projeto_dkw_crm/docs/github-cicd.md).

## Docker

```bash
docker build -t allcrm-platform:local .
docker run --env-file .env -p 3000:3000 -v %cd%/data:/app/data -v %cd%/logs:/app/logs allcrm-platform:local
```

Com Docker Compose:

```bash
docker compose -f docker-compose.example.yml up --build
```

## Healthcheck

- `GET /healthz`: processo vivo.
- `GET /readyz`: configuracao minima carregada.

## SaaS, suporte e Kubernetes

Veja [docs/saas-kubernetes-observabilidade.md](D:/projeto_dkw_crm/docs/saas-kubernetes-observabilidade.md) para a base de multiempresa, acesso master, observabilidade e manifests Kubernetes.

Veja tambem [docs/saas-tenants.md](D:/projeto_dkw_crm/docs/saas-tenants.md) para o desenho de tenants, subdominios por cliente, painel master e isolamento de dados.
