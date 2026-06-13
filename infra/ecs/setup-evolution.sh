#!/bin/bash
# =============================================================================
# Setup Evolution API no ECS Fargate — cluster neuraxcrm-cluster
# Execute este script UMA VEZ para criar toda a infraestrutura.
# Pré-requisito: AWS CLI configurado com permissões de admin.
# =============================================================================
set -euo pipefail

AWS_REGION="sa-east-1"
AWS_ACCOUNT="324037288309"
CLUSTER="neuraxcrm-cluster"
SERVICE_NAME="neurax-evolution-api-service"
TASK_FAMILY="neurax-evolution-api"
EVO_IMAGE="atendai/evolution-api:latest"
EVO_PORT=8080

# --------------------------------------------------------------------------
# 1. Descobrir VPC/subnets/security-group do serviço CRM já existente
# --------------------------------------------------------------------------
echo "==> Buscando configurações de rede do cluster existente..."

EXISTING_SERVICE_ARN=$(aws ecs list-services \
  --cluster "$CLUSTER" \
  --region "$AWS_REGION" \
  --query "serviceArns[0]" --output text)

VPC_CONFIG=$(aws ecs describe-services \
  --cluster "$CLUSTER" \
  --services "$EXISTING_SERVICE_ARN" \
  --region "$AWS_REGION" \
  --query "services[0].networkConfiguration.awsvpcConfiguration")

SUBNETS=$(echo "$VPC_CONFIG" | python3 -c "import sys,json; d=json.load(sys.stdin); print(','.join(d['subnets']))")
SECURITY_GROUPS=$(echo "$VPC_CONFIG" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['securityGroups'][0])")

echo "    Subnets:         $SUBNETS"
echo "    Security Group:  $SECURITY_GROUPS"

# --------------------------------------------------------------------------
# 2. Criar EFS para persistir sessões do WhatsApp
# --------------------------------------------------------------------------
echo "==> Criando EFS para sessões do Evolution API..."

EFS_ID=$(aws efs create-file-system \
  --region "$AWS_REGION" \
  --performance-mode generalPurpose \
  --throughput-mode bursting \
  --encrypted \
  --tags Key=Name,Value=neurax-evolution-data \
  --query "FileSystemId" --output text)

echo "    EFS criado: $EFS_ID"
echo "    Aguardando EFS ficar disponível..."
aws efs wait file-system-available --file-system-id "$EFS_ID" --region "$AWS_REGION"

# Obter VPC ID a partir do security group
VPC_ID=$(aws ec2 describe-security-groups \
  --group-ids "$SECURITY_GROUPS" \
  --region "$AWS_REGION" \
  --query "SecurityGroups[0].VpcId" --output text)

# Criar security group para o EFS (permite NFS da VPC)
EFS_SG_ID=$(aws ec2 create-security-group \
  --group-name "neurax-evo-efs-sg" \
  --description "EFS access for Evolution API" \
  --vpc-id "$VPC_ID" \
  --region "$AWS_REGION" \
  --query "GroupId" --output text)

aws ec2 authorize-security-group-ingress \
  --group-id "$EFS_SG_ID" \
  --protocol tcp \
  --port 2049 \
  --source-group "$SECURITY_GROUPS" \
  --region "$AWS_REGION"

echo "    Security Group EFS: $EFS_SG_ID"

# Criar mount targets em cada subnet
for SUBNET in $(echo "$SUBNETS" | tr ',' ' '); do
  echo "    Criando mount target em subnet $SUBNET..."
  aws efs create-mount-target \
    --file-system-id "$EFS_ID" \
    --subnet-id "$SUBNET" \
    --security-groups "$EFS_SG_ID" \
    --region "$AWS_REGION" > /dev/null
done

echo "    Aguardando mount targets ficarem disponíveis (pode levar ~2 min)..."
sleep 30

# --------------------------------------------------------------------------
# 3. Atualizar task-definition com o EFS ID real
# --------------------------------------------------------------------------
echo "==> Registrando task definition..."

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TASK_DEF_FILE="$SCRIPT_DIR/evolution-task-definition.json"

# Substituir placeholder pelo ID real do EFS
TASK_DEF_JSON=$(sed "s/PREENCHER_EFS_ID/$EFS_ID/g" "$TASK_DEF_FILE")

TASK_DEF_ARN=$(echo "$TASK_DEF_JSON" | aws ecs register-task-definition \
  --region "$AWS_REGION" \
  --cli-input-json file:///dev/stdin \
  --query "taskDefinition.taskDefinitionArn" --output text)

echo "    Task Definition: $TASK_DEF_ARN"

# --------------------------------------------------------------------------
# 4. Criar CloudWatch Log Group
# --------------------------------------------------------------------------
echo "==> Criando log group no CloudWatch..."
aws logs create-log-group \
  --log-group-name "/ecs/neurax-evolution-api" \
  --region "$AWS_REGION" 2>/dev/null || echo "    (já existe)"

# --------------------------------------------------------------------------
# 5. Criar ALB Target Group para Evolution API
# --------------------------------------------------------------------------
echo "==> Criando ALB Target Group..."

# Descobrir ARN do ALB existente
ALB_ARN=$(aws elbv2 describe-load-balancers \
  --region "$AWS_REGION" \
  --query "LoadBalancers[?contains(LoadBalancerName, 'neuraxcrm') || contains(LoadBalancerName, 'neurax')].LoadBalancerArn | [0]" \
  --output text)

if [ "$ALB_ARN" = "None" ] || [ -z "$ALB_ARN" ]; then
  echo "    AVISO: ALB não encontrado automaticamente. Você precisará criar o Target Group manualmente."
  echo "    Veja as instruções em infra/ecs/DEPLOY-EVOLUTION.md"
else
  TG_ARN=$(aws elbv2 create-target-group \
    --name "neurax-evolution-tg" \
    --protocol HTTP \
    --port "$EVO_PORT" \
    --vpc-id "$VPC_ID" \
    --target-type ip \
    --health-check-path "/" \
    --health-check-interval-seconds 30 \
    --healthy-threshold-count 2 \
    --unhealthy-threshold-count 3 \
    --region "$AWS_REGION" \
    --query "TargetGroups[0].TargetGroupArn" --output text)

  echo "    Target Group: $TG_ARN"

  # Adicionar listener rule no HTTPS (443) para evo.neuraxcrm.com.br
  HTTPS_LISTENER_ARN=$(aws elbv2 describe-listeners \
    --load-balancer-arn "$ALB_ARN" \
    --region "$AWS_REGION" \
    --query "Listeners[?Port==\`443\`].ListenerArn | [0]" --output text)

  if [ "$HTTPS_LISTENER_ARN" != "None" ] && [ -n "$HTTPS_LISTENER_ARN" ]; then
    aws elbv2 create-rule \
      --listener-arn "$HTTPS_LISTENER_ARN" \
      --priority 10 \
      --conditions '[{"Field":"host-header","Values":["evo.neuraxcrm.com.br"]}]' \
      --actions "[{\"Type\":\"forward\",\"TargetGroupArn\":\"$TG_ARN\"}]" \
      --region "$AWS_REGION" > /dev/null
    echo "    Listener rule HTTPS criada para evo.neuraxcrm.com.br"
  fi
fi

# --------------------------------------------------------------------------
# 6. Criar ECS Service
# --------------------------------------------------------------------------
echo "==> Criando ECS Service..."

NETWORK_CONFIG="{
  \"awsvpcConfiguration\": {
    \"subnets\": [$(echo "$SUBNETS" | sed 's/,/\",\"/g' | sed 's/^/\"/' | sed 's/$/\"/')],
    \"securityGroups\": [\"$SECURITY_GROUPS\"],
    \"assignPublicIp\": \"ENABLED\"
  }
}"

CREATE_ARGS=(
  --cluster "$CLUSTER"
  --service-name "$SERVICE_NAME"
  --task-definition "$TASK_DEF_ARN"
  --desired-count 1
  --launch-type FARGATE
  --network-configuration "$NETWORK_CONFIG"
  --region "$AWS_REGION"
)

if [ -n "${TG_ARN:-}" ]; then
  CREATE_ARGS+=(
    --load-balancers "[{\"targetGroupArn\":\"$TG_ARN\",\"containerName\":\"evolution-api\",\"containerPort\":$EVO_PORT}]"
  )
fi

aws ecs create-service "${CREATE_ARGS[@]}" > /dev/null

echo "    Service criado: $SERVICE_NAME"
echo ""
echo "==> Aguardando serviço estabilizar (pode levar 3-5 min)..."
aws ecs wait services-stable \
  --cluster "$CLUSTER" \
  --services "$SERVICE_NAME" \
  --region "$AWS_REGION"

echo ""
echo "======================================================================"
echo " Evolution API disponível em: https://evo.neuraxcrm.com.br"
echo " API Key:  NeuraxEvo2026!ChangeThisKey"
echo " EFS ID:   $EFS_ID (já atualizado no task definition)"
echo "======================================================================"
echo ""
echo "PRÓXIMOS PASSOS:"
echo "  1. Troque a AUTHENTICATION_API_KEY no evolution-task-definition.json"
echo "  2. Salve o EFS ID ($EFS_ID) no arquivo evolution-task-definition.json"
echo "     (substitua PREENCHER_EFS_ID pelo valor acima)"
echo "  3. Configure o CNAME evo.neuraxcrm.com.br → DNS do seu ALB no Route 53 / Registro.br"
echo "  4. No CRM, vá em Configurações > WhatsApp Chat e preencha:"
echo "     - URL do servidor: https://evo.neuraxcrm.com.br"
echo "     - API Key: NeuraxEvo2026!ChangeThisKey"
echo "======================================================================"
