# Mapeamento CISS -> CRM

## Identificacao

| Campo CISS | Uso na integracao |
| --- | --- |
| `idempresa` | parte da chave unica |
| `idorcamento` | parte da chave unica |
| `idempresa:idorcamento` | chave usada no estado local |

## Contato

| Campo CISS | Campo CRM |
| --- | --- |
| `nome` | `name` |
| `fonecelular` ou melhor telefone de `fone1` | `phone` |
| `descrcidade` | campo extra do contato `cidade` |
| `uf` | campo extra do contato `estado` |
| `cnpjcpf` | campo extra do contato `cnpjcpf` |
| `idclifor` | campo extra do contato `idClienteCiss` |

Observacao: por enquanto mantemos apenas dados relativamente estaveis do cliente no contato.
Dados do pedido ficam desligados ate a DKW confirmar campos personalizados do negocio.

## Negocio

| Campo CISS | Campo CRM |
| --- | --- |
| `valtotliquido` | `amount` via `PUT /api/commercial-order/{id}` |
| `status` / `statusgestao` / flags | `step`, via `CRM_STAGE_MAP_JSON` |
| vendedor responsavel | pendente de mapeamento futuro com `/crm/vendedores` |

## Campos personalizados desejados no negocio

Assim que a DKW confirmar endpoint/payload:

| Campo CISS | Campo desejado no negocio |
| --- | --- |
| `idorcamento` | `numeroOrcamento` |
| `idempresa` | `idEmpresa` |
| `valtotliquido` | `valorPedido` |
| `dtmovimento` | `dataMovimento` |
| `dtvalidade` | `dataValidade` |
| `status` | `statusPedido` |
| `statusgestao` | `statusGestao` |
| `idsituacaogestao` | `situacaoGestao` |
| `desrdav` | `tipoDocumento` |
| `vendedores` | `vendedorCiss` |
| `usuario` | `usuarioCiss` |

Esses campos ja estao mapeados em codigo por `buildOrderCustomFields`, mas nao sao enviados por padrao.
Para ligar depois da confirmacao: `CRM_SEND_ORDER_CUSTOM_FIELDS=true`.
