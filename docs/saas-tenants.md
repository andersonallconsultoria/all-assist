# SaaS multiempresa do Fly CRM

O Fly CRM agora trabalha com o conceito de tenant. Cada tenant representa uma empresa cliente da plataforma, como Materiais Lobato ou Boa Vista Pisos.

## Modelo inicial

A aplicacao e unica:

```text
Fly CRM
```

Os dados sao separados por `tenantId`:

```text
tenants
users
contacts
deals
dealLogs
conversations
messages
integrationSettings
integrationEvents
requestMetrics
```

Toda consulta operacional usa o tenant ativo. Isso evita que usuarios de uma empresa vejam dados de outra.

## Subdominios

O desenho esperado para producao e:

```text
crm.neurax.com.br
admin.crm.neurax.com.br
materiaislobato.crm.neurax.com.br
boavistapisos.crm.neurax.com.br
```

Configuracao desejada no DNS:

```text
*.crm.neurax.com.br -> Application Load Balancer
crm.neurax.com.br -> Application Load Balancer
```

A aplicacao le o host acessado. Quando recebe:

```text
materiaislobato.crm.neurax.com.br
```

ela busca:

```text
tenant.slug = materiaislobato
```

## Painel master

Usuarios com permissao `support:tenants` conseguem acessar o painel Suporte Master.

Nesse painel e possivel:

- cadastrar clientes SaaS;
- reservar o slug/subdominio;
- visualizar uso por tenant;
- entrar no ambiente do tenant com um clique;
- consultar falhas de integracao, logs e performance.

Ao trocar de ambiente, o sistema grava um cookie seguro com o tenant ativo. As APIs passam a responder como se o master estivesse dentro daquele cliente.

## Integracao ERP por cliente

As configuracoes do ERP agora tambem pertencem ao tenant:

```text
tenantId
provider
host
port
username
password
clientId
clientSecret
```

Quando o master entra no ambiente de um cliente e salva/testa a integracao ERP, isso afeta somente aquele cliente.

## Proximo passo de producao

Hoje a persistencia do prototipo ainda usa `data/crm.json`. Isso e suficiente para evolucao visual, regras e validacao.

Antes de clientes reais em producao, migrar para:

```text
AWS RDS PostgreSQL
```

O desenho continua igual, mas cada tabela tera `tenant_id`.

Depois, se um cliente grande exigir isolamento, podemos evoluir para:

```text
Banco compartilhado com tenant_id para clientes comuns
Banco dedicado ou ambiente dedicado para clientes grandes
```
