# Agenda de Integracoes ERP

Cada cliente SaaS pode ter frequencias diferentes por tipo de dado.

## Tipos iniciais

```text
orders    Pedidos e orcamentos
products  Produtos
stock     Estoque
customers Clientes
sellers   Vendedores
```

## Defaults

```text
Pedidos/orcamentos: ativo, incremental, a cada 1 minuto
Produtos: pausado, carga geral + incremental, a cada 10 minutos
Estoque: ativo, consulta online, cache de 60 segundos
Clientes: pausado, incremental, a cada 10 minutos
Vendedores: pausado, incremental, a cada 60 minutos
```

## Estrategias

`incremental`: usa um campo cursor, como `dtalteracao`, para buscar somente alterados.

`full_then_incremental`: faz uma carga geral inicial e depois passa a usar incremental.

`full`: sempre faz carga geral. Deve ser usado com cuidado.

`online`: nao roda no agendador. Consulta no ERP sob demanda, como estoque ao clicar no produto.

## APIs

```text
GET /api/integrations/schedules
PUT /api/integrations/schedules/{entityType}
```

Exemplo:

```json
{
  "enabled": true,
  "intervalMinutes": 10,
  "strategy": "full_then_incremental",
  "cursorField": "dtalteracao"
}
```

## Recomendacao

Para estoque, manter online com cache curto. Atualizar estoque completo o tempo todo pode deixar o ERP e o CRM lentos sem necessidade.
