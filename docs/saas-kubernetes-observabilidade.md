# Fly CRM - base SaaS, suporte e Kubernetes

Este documento descreve a estrutura inicial para evoluir o Fly CRM como plataforma SaaS multiempresa, com acesso master de suporte, observabilidade e deploy em Kubernetes.

## Direcao de arquitetura

O Fly CRM passa a ter tres camadas principais:

- Plataforma: portal web, login, permissoes, CRM, kanban, conversas e telas de suporte.
- Integracao: sincronizacao periodica com ERPs, historico por pedido/orcamento e eventos de sucesso/erro/ignorado.
- Operacao: Kubernetes, logs, metricas de requisicao, auditoria de usuario e painel master.

Hoje o armazenamento local ainda usa `data/crm.json`, suficiente para prototipo e testes. Para producao SaaS, o proximo passo recomendado e migrar para PostgreSQL, mantendo o mesmo modelo:

- `tenants`: clientes/empresas usando o SaaS.
- `users` e `roles`: usuarios, perfis e permissoes.
- `contacts`, `deals`, `dealLogs`: CRM operacional.
- `syncRuns` e `integrationEvents`: historico da integracao ERP.
- `auditEvents`: acoes de usuario e suporte.
- `requestMetrics`: performance e erros HTTP.

## Acesso master

O usuario master e configurado por variaveis de ambiente:

```env
NEURAXCRM_BOOTSTRAP_MASTER_NAME=Suporte Neurax
NEURAXCRM_BOOTSTRAP_MASTER_EMAIL=master@neuraxcrm.local
NEURAXCRM_BOOTSTRAP_MASTER_PASSWORD=change-me-too
```

O perfil `Master ALL` possui permissoes globais:

- `support:view`: visualizar painel master.
- `support:logs`: consultar logs recentes.
- `support:tenants`: consultar tenants.
- `observability:view`: consultar metricas de performance.

Clientes comuns nao devem receber essas permissoes.

## Observabilidade

A plataforma registra:

- Requisicoes de API e webhooks com duracao, status HTTP, usuario e tenant.
- Requisicoes lentas acima de `NEURAXCRM_SLOW_REQUEST_MS`.
- Eventos de integracao ERP: iniciado, finalizado, criado, atualizado, ignorado, erro.
- Auditoria: login, logout, criacao de usuario, envio de mensagem, sincronizacao manual e logs de negocio.
- Logs estruturados JSON em `LOG_FILE`.

Variaveis principais:

```env
NEURAXCRM_SLOW_REQUEST_MS=1000
NEURAXCRM_OBSERVABILITY_MAX_RECORDS=5000
LOG_FILE=/app/logs/integration.log
```

## Endpoints de suporte

Disponiveis apenas para master/suporte:

- `GET /api/support/overview`
- `GET /api/support/tenants`
- `GET /api/support/integration-events`
- `GET /api/support/audit-events`
- `GET /api/support/request-metrics`
- `GET /api/support/logs`

## Kubernetes

Manifests base:

- `k8s/deployment.yaml`
- `k8s/service.yaml`
- `k8s/pvc.yaml`
- `k8s/configmap.example.yaml`
- `k8s/secret.example.yaml`
- `k8s/ingress.example.yaml`
- `k8s/hpa.example.yaml`

Fluxo sugerido:

```bash
docker build -t neuraxcrm-platform:latest .
kubectl apply -f k8s/pvc.yaml
kubectl apply -f k8s/configmap.example.yaml
kubectl apply -f k8s/secret.example.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
```

Depois, ajuste `k8s/ingress.example.yaml` com o dominio real e aplique quando o cluster tiver Ingress Controller configurado.

## Proximos passos antes de producao

- Migrar armazenamento de `data/crm.json` para PostgreSQL.
- Separar worker de integracao ERP do web app, permitindo escalar web e sync separadamente.
- Adicionar Prometheus/OpenTelemetry para metricas externas do cluster.
- Adicionar backup automatico do banco e retencao de logs.
- Adicionar isolamento real por tenant em todas as queries.
- Configurar secrets reais via Kubernetes Secret, SealedSecrets ou External Secrets.
