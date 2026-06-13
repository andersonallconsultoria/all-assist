# Deploy Evolution API — ECS Fargate

## Visão Geral

A Evolution API roda como um serviço separado no mesmo cluster `allassist-cluster`, exposta em `evo.allassist.com.br` via ALB na região `sa-east-1` (São Paulo).

## Pré-requisitos

- AWS CLI configurado: `aws configure` com credenciais de admin
- Bash disponível (Linux/Mac ou WSL no Windows)
- ALB já existente com listener HTTPS (443) e certificado `*.allassist.com.br`

---

## Passo 1 — Configurar a API Key

Antes de subir, edite `infra/ecs/evolution-task-definition.json` e troque `ALLEvo2026!ChangeThisKey` por uma chave forte. Você pode gerar uma com:

```bash
openssl rand -hex 32
```

---

## Passo 2 — Executar o script de setup

```bash
cd infra/ecs
chmod +x setup-evolution.sh
./setup-evolution.sh
```

O script faz automaticamente:
1. Descobre VPC/subnets/security group do cluster CRM existente
2. Cria EFS para persistência das sessões WhatsApp
3. Cria mount targets do EFS em cada subnet
4. Registra a task definition com o EFS ID real
5. Cria CloudWatch Log Group
6. Cria ALB Target Group na porta 8080
7. Adiciona listener rule no HTTPS para `evo.allassist.com.br`
8. Cria o ECS Service e aguarda estabilização

---

## Passo 3 — DNS

Após o script terminar, adicione um CNAME no seu DNS:

| Nome | Tipo | Valor |
|------|------|-------|
| `evo.allassist.com.br` | CNAME | `<DNS do ALB>` (ex: `allassist-alb-xxx.sa-east-1.elb.amazonaws.com`) |

Para descobrir o DNS do ALB:
```bash
aws elbv2 describe-load-balancers \
  --region sa-east-1 \
  --query "LoadBalancers[].DNSName" --output text
```

---

## Passo 4 — Salvar o EFS ID no task definition

O script exibe o EFS ID ao final. Salve-o no arquivo `evolution-task-definition.json` substituindo `PREENCHER_EFS_ID` pelo valor real — isso garante que futuros redeploys mantenham a referência ao mesmo EFS.

---

## Passo 5 — Configurar no CRM

No CRM (usuário admin), vá em:
**Configurações → WhatsApp Chat → Servidor Evolution API**

Preencha:
- **URL do servidor**: `https://evo.allassist.com.br`
- **API Key**: a chave que você definiu no Passo 1

---

## Atualizar para versão mais nova da Evolution API

Quando quiser atualizar a imagem, acione o workflow manual no GitHub:
**Actions → Atualizar Evolution API no ECS → Run workflow**

Ou via CLI:
```bash
aws ecs update-service \
  --cluster allassist-cluster \
  --service neurax-evolution-api-service \
  --force-new-deployment \
  --region sa-east-1
```

---

## Se não tiver ALB (setup manual)

Caso o script não encontre o ALB automaticamente:

1. **Criar Target Group** no console AWS:
   - EC2 → Target Groups → Create target group
   - Type: **IP addresses**, Port: **8080**, Protocol: **HTTP**
   - VPC: mesma do cluster CRM
   - Health check path: `/`
   - Nome: `allassist-evolution-tg`

2. **Adicionar regra no Listener HTTPS (443)**:
   - EC2 → Load Balancers → seu ALB → Listeners → HTTPS:443 → View/edit rules
   - Add rule: IF Host Header = `evo.allassist.com.br` → THEN Forward to `allassist-evolution-tg`

3. **Criar o ECS Service** apontando para o Target Group acima.

---

## Arquitetura

```
Internet
   │
   ▼
Route 53 / Registro.br
  evo.allassist.com.br → CNAME → ALB (sa-east-1)
   │
   ▼ (porta 443 HTTPS, certificado *.allassist.com.br)
Application Load Balancer
  Listener rule: host = evo.allassist.com.br → allassist-evolution-tg
   │
   ▼
ECS Service: neurax-evolution-api-service (cluster: allassist-cluster)
  Task: neurax-evolution-api (atendai/evolution-api:latest)
  Port: 8080
  Volume: EFS → /evolution/instances (sessões WhatsApp)
```
