# Perguntas objetivas para DKW

## 1. Campos personalizados do negocio

A melhoria informa que campos personalizados do negocio podem ser gerenciados por webhooks e API externa.
Precisamos do formato oficial para criar/atualizar campos no negocio.

Testes feitos:

- `PUT /api/commercial-order/{telefone}` com `customFields`.
- `PUT /api/commercial-order/{telefone}` com `orderCustomFields`.
- Webhook com campos na raiz do JSON.
- Webhook com `customFields`.
- Webhook com `commercialOrder.customFields`.

Resultado atual:

- campos foram salvos como `extraInfo` do contato; ou
- `orderCustomFields` voltou vazio no negocio.

Pergunta:

Qual endpoint e payload devem ser usados para gravar campos como `numeroOrcamento`, `origemPedido` e `observacaoPedido` dentro do negocio?

## 2. Um negocio por pedido/orcamento

No CISS, o mesmo cliente pode ter varios `idorcamento` com o mesmo telefone.
Para a integracao, cada `idorcamento` precisa virar um negocio separado.

Nos testes do webhook, quando o contato ja possui negocio, a plataforma pode reaproveitar/atualizar o negocio existente.

Pergunta:

Existe uma forma via webhook/API externa de sempre criar um novo negocio por pedido, usando uma chave externa como `idorcamento`?

## 3. Atualizacao por chave externa

Depois de criado, precisamos atualizar o mesmo negocio quando o pedido mudar de status.

Pergunta:

O CRM aceita buscar/atualizar negocio por uma chave externa do pedido, por exemplo `idempresa + idorcamento`, em vez de usar apenas telefone ou id interno do negocio?
