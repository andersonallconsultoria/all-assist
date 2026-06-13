# GitHub Actions — Deploy automático do ALL Assist

Este projeto está preparado para deploy automático em ECS Fargate usando GitHub Actions.

## Fluxo

1. Desenvolvedor altera o código.
2. Faz commit e push para `main`.
3. GitHub Actions roda `npm test`.
4. Se os testes passarem, gera a imagem Docker.
5. Envia a imagem para o ECR.
6. Registra uma nova revisão da Task Definition.
7. Atualiza o ECS Service `allassist-platform-service`.

## Arquivos do pipeline

- `.github/workflows/deploy-ecs.yml` — deploy automático do CRM no push para main
- `.github/workflows/update-evolution.yml` — atualização manual da Evolution API
- `infra/ecs/task-definition.json` — task definition do CRM
- `infra/ecs/evolution-task-definition.json` — task definition da Evolution API

## Segredo necessário no GitHub

Crie este segredo no repositório (**Settings → Secrets → Actions**):

```
AWS_GITHUB_DEPLOY_ROLE_ARN
```

Valor: ARN da role IAM com permissão para deploy no ECS. Exemplo:

```
arn:aws:iam::324037288309:role/allassist-github-actions-deploy-role
```

> Recomendação: usar OIDC do GitHub com uma role IAM dedicada, em vez de salvar access key/secret no GitHub.

## Configurações atuais do workflow

```
AWS_REGION=sa-east-1
AWS_ACCOUNT_ID=324037288309
ECR_REPOSITORY=allassist-platform
ECS_CLUSTER=allassist-cluster
ECS_SERVICE=allassist-platform-service
CONTAINER_NAME=allassist-platform
```

## Como fazer um deploy

```bash
git add .
git commit -m "descrição da mudança"
git push origin main
```

O GitHub Actions faz o restante automaticamente.

## Como acompanhar o deploy

No GitHub:
```
Repository → Actions → Deploy ALL Assist to ECS Fargate
```

Na AWS:
```
ECS → Clusters → allassist-cluster → Services → allassist-platform-service
CloudWatch → Logs → /ecs/allassist-platform
EC2 → Target Groups → allassist-platform-tg
```

## Rollback

Se uma versão nova falhar, volte para uma revisão anterior da Task Definition:

```bash
aws ecs update-service \
  --cluster allassist-cluster \
  --service allassist-platform-service \
  --task-definition allassist-platform:REVISAO_ANTERIOR \
  --region sa-east-1
```
