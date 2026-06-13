# Operacao da integracao

## Loop de sincronizacao

O servico roda continuamente e executa um ciclo a cada `POLL_INTERVAL_MS`.
O padrao recomendado e `60000` ms, ou seja, 1 minuto.

Em cada ciclo:

1. Autentica no CISS.
2. Busca `gestao_vendas` por periodo e empresa.
3. Calcula uma chave unica: `idempresa:idorcamento`.
4. Calcula um hash dos campos relevantes do pedido.
5. Se o pedido e novo ou mudou, sincroniza com CRM.
6. Grava o resultado em `STATE_FILE`.

## Regra atual de envio ao CRM

Para pedido novo:

1. Envia contato para o webhook de entrada do CRM.
2. Consulta negocios pelo telefone.
3. Pega o negocio mais recente.
4. Atualiza valor e etapa via `PUT /api/commercial-order/{id}`.

Para pedido ja sincronizado e alterado:

1. Usa o `crmOrderId` salvo no estado.
2. Atualiza valor e etapa via `PUT /api/commercial-order/{id}`.

## Mapeamento de etapas

Configurado por `CRM_STAGE_MAP_JSON`.

Exemplo:

```json
{
  "PENDENTE": "Entrada",
  "EFETIVADO": "Venda efetivada",
  "FATURADO": "Gerou documento fiscal",
  "NEGADO": "Pedido negado"
}
```

## Logs

Todos os logs sao JSON por linha.
Eventos principais:

- `sync_run_start`: inicio do ciclo.
- `ciss_auth_success`: autenticacao CISS ok.
- `ciss_page_fetched`: pagina buscada no CISS.
- `ciss_order_sync_start`: inicio da sincronizacao de um pedido.
- `crm_webhook_sent`: contato/lead enviado ao webhook.
- `crm_order_reused_for_multiple_ciss_orders`: alerta importante quando mais de um pedido CISS caiu no mesmo negocio CRM.
- `ciss_order_sync_success`: pedido sincronizado.
- `ciss_order_sync_failed`: falha com detalhes.
- `sync_run_finished`: resumo do ciclo.

## Protecao contra sobrescrita de negocios

`CRM_FAIL_ON_REUSED_ORDER_ID=true` fica ligado por padrao.

Quando um pedido CISS novo aponta para um `crmOrderId` que ja esta salvo para outro `idorcamento`, o servico para aquele pedido com erro e nao atualiza o card.
Isso evita sobrescrever um negocio de outro pedido enquanto a DKW nao confirma como criar um negocio por orcamento.

Tambem bloqueia antes do webhook quando um pedido novo usa telefone que ja apareceu em outro `idorcamento` sincronizado.
Isso evita duplicar campos extras no contato durante os testes enquanto o CRM ainda reaproveita o mesmo card.

Se a DKW confirmar que o webhook cria sempre um novo negocio por pedido, essa protecao continua segura e nunca deve disparar.
Se for necessario aceitar reaproveitamento temporariamente, altere para `false`, mas isso nao representa o modelo final desejado.

## Cuidados antes de producao

- Confirmar com a DKW como criar um negocio por pedido quando o telefone do cliente se repete.
- Confirmar endpoint/payload de campos personalizados do negocio.
- Manter `CRM_SEND_ORDER_CUSTOM_FIELDS=false` ate essa confirmacao.
- Manter `CRM_FAIL_ON_REUSED_ORDER_ID=true` ate confirmar a criacao correta de multiplos negocios.
- Usar volume persistente para `STATE_FILE`.
- Rodar apenas 1 replica por enquanto, para evitar concorrencia no mesmo estado.
