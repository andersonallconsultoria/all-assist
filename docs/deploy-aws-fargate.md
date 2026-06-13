# Deploy do Neurax CRM na AWS com ECS Fargate

Este guia descreve o processo para publicar o Neurax CRM em `neuraxcrm.com.br`, usando Docker, Amazon ECR, Amazon ECS Fargate, Application Load Balancer, AWS Certificate Manager e DNS — tudo na região `sa-east-1` (São Paulo).

## Visão geral dos recursos AWS

- **ECR**: `neuraxcrm-platform` — repositório da imagem Docker
- **ECS Cluster**: `neuraxcrm-cluster`
- **ECS Service**: `neuraxcrm-platform-service`
- **ALB**: internet-facing, listeners HTTP:80 e HTTPS:443
- **ACM**: certificado wildcard `*.neuraxcrm.com.br`
- **CloudWatch Logs**: `/ecs/neuraxcrm-platform`
- **IAM Task Role**: `neuraxcrmTaskRole`

> O deploy automático hoje é feito via GitHub Actions (push para `main`). Este guia é referência para setup inicial ou recriação manual.

---

## 1. Pré-requisitos

- Docker Desktop instalado
- AWS CLI instalado e configurado (`aws configure`)
- Usuário IAM com permissões: ECR, ECS, ELB, ACM, EFS, IAM PassRole, CloudWatch Logs

---

## 2. Criar repositório no ECR

```bash
aws ecr create-repository --repository-name neuraxcrm-platform --region sa-east-1
```

Definir variáveis de ambiente:

```bash
# Windows CMD
set AWS_ACCOUNT_ID=324037288309
set ECR_IMAGE=%AWS_ACCOUNT_ID%.dkr.ecr.sa-east-1.amazonaws.com/neuraxcrm-platform

# Git Bash / WSL
export AWS_ACCOUNT_ID=324037288309
export ECR_IMAGE=$AWS_ACCOUNT_ID.dkr.ecr.sa-east-1.amazonaws.com/neuraxcrm-platform
```

Login e push manual (normalmente feito pelo CI/CD):

```bash
# Login
aws ecr get-login-password --region sa-east-1 | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.sa-east-1.amazonaws.com

# Build e push
docker build -t $ECR_IMAGE:latest .
docker push $ECR_IMAGE:latest
```

---

## 3. Criar cluster ECS

```
ECS → Clusters → Create cluster
Nome: neuraxcrm-cluster
Infraestrutura: AWS Fargate
```

---

## 4. Criar IAM Task Role

```
IAM → Roles → Create role
Trusted entity: ECS Tasks (ecs-tasks.amazonaws.com)
Nome: neuraxcrmTaskRole
Permissões: AmazonECSTaskExecutionRolePolicy + política customizada se necessário
```

---

## 5. Criar Security Groups

### ALB SG (`neuraxcrm-alb-sg`)
- Entrada: TCP 80 e 443 de `0.0.0.0/0`
- Saída: tudo liberado

### ECS Task SG (`neuraxcrm-ecs-sg`)
- Entrada: TCP 3000 somente do ALB SG
- Saída: tudo liberado (para acesso ao ERP, Meta API, internet)

---

## 6. Criar ALB

```
EC2 → Load Balancers → Create → Application Load Balancer
Nome: neuraxcrm-alb
Scheme: Internet-facing
VPC: sua VPC padrão
Subnets: selecionar todas as subnets públicas disponíveis
Security group: neuraxcrm-alb-sg
```

**Listener HTTP:80** → Redirect para HTTPS (301)
**Listener HTTPS:443** → Forward para Target Group do CRM

---

## 7. Criar Target Group

```
EC2 → Target Groups → Create
Nome: neuraxcrm-platform-tg
Type: IP addresses
Protocol: HTTP, Port: 3000
VPC: sua VPC
Health check path: /healthz
```

---

## 8. Certificado HTTPS (ACM)

```
ACM → Request certificate → Public
Domínios:
  neuraxcrm.com.br
  *.neuraxcrm.com.br
Validação: DNS
```

O ACM gera 2 registros CNAME. Adicione-os no seu DNS (Registro.br ou Route 53). Após validação (~30 min), status fica `Issued`.

---

## 9. Registrar Task Definition

O arquivo `infra/ecs/task-definition.json` já está configurado. Registre via CLI:

```bash
aws ecs register-task-definition \
  --cli-input-json file://infra/ecs/task-definition.json \
  --region sa-east-1
```

---

## 10. Criar ECS Service

```
ECS → Clusters → neuraxcrm-cluster → Services → Create
Launch type: Fargate
Task definition: neuraxcrm-platform
Service name: neuraxcrm-platform-service
Desired tasks: 1
Networking:
  VPC: sua VPC
  Subnets: subnets públicas
  Security group: neuraxcrm-ecs-sg
  Public IP: ENABLED
Load balancing:
  ALB: neuraxcrm-alb
  Target group: neuraxcrm-platform-tg
```

---

## 11. Apontar domínio no DNS

Após o ALB ser criado, copie o DNS dele (ex: `neuraxcrm-alb-xxx.sa-east-1.elb.amazonaws.com`) e adicione no seu DNS:

| Nome | Tipo | Valor |
|------|------|-------|
| `*` (wildcard) | CNAME | DNS do ALB |
| `www` | CNAME | DNS do ALB |

Se usar Route 53, pode usar ALIAS record no domínio raiz `neuraxcrm.com.br`.

---

## 12. Atualização via GitHub Actions

O método preferido é o push para `main`:

```bash
git add .
git commit -m "descrição"
git push origin main
```

O CI/CD (`deploy-ecs.yml`) faz build, push para ECR e deploy no ECS automaticamente.

Para forçar novo deploy sem mudança de código:
```bash
aws ecs update-service \
  --cluster neuraxcrm-cluster \
  --service neuraxcrm-platform-service \
  --force-new-deployment \
  --region sa-east-1
```

---

## 13. Rollback

```bash
aws ecs update-service \
  --cluster neuraxcrm-cluster \
  --service neuraxcrm-platform-service \
  --task-definition neuraxcrm-platform:NUMERO_REVISAO_ANTERIOR \
  --region sa-east-1
```

---

## 14. Melhorias planejadas para produção

- Migrar `data/crm.json` para PostgreSQL/RDS
- EFS para persistência em `/app/data` enquanto usa JSON
- Secrets Manager para senhas e tokens
- CloudWatch Alarms para monitoramento
- WAF no ALB
- Tasks em private subnets com NAT Gateway
