# Estrutura Comercial Multiempresa

Esta base prepara o Fly CRM para clientes SaaS com uma ou varias lojas/CNPJs.

## Hierarquia

```text
Cliente SaaS
Grupo de empresas
Empresa/CNPJ
Pessoa comercial
Usuario do sistema
```

Exemplo:

```text
Cliente SaaS: Cliente Padrao
Grupo: Materiais
Empresas: Loja 01, Loja 02

Grupo: Supermercado
Empresas: Loja 10
```

## Colecoes

```text
companyGroups
tenantCompanies
salesPeople
```

`companyGroups` guarda grupos de CNPJs dentro do cliente SaaS.

`tenantCompanies` guarda lojas/CNPJs e o codigo da empresa no ERP.

`salesPeople` guarda vendedores e supervisores, podendo vincular codigo ERP, usuario do sistema, grupos e empresas.

## Escopo de acesso

O usuario pode ter um dos modos abaixo:

```text
tenant
groups
companies
seller
```

`tenant`: acessa todo o cliente SaaS.

`groups`: acessa apenas os grupos definidos.

`companies`: acessa apenas os CNPJs definidos.

`seller`: acessa as empresas vinculadas ao vendedor ERP relacionado.

## Vendedor ERP

O formato inicial esperado do CISS e:

```text
2 - VENDEDOR EXEMPLO
```

O sistema separa:

```text
erpCode: 2
name: VENDEDOR EXEMPLO
```

Isso permite filtrar pedidos/orcamentos do vendedor e relacionar o vendedor a um supervisor.

## APIs master iniciais

```text
GET  /api/support/tenants/{tenantId}/structure
POST /api/support/tenants/{tenantId}/groups
POST /api/support/tenants/{tenantId}/companies
POST /api/support/tenants/{tenantId}/sales-people
PUT  /api/support/users/{userId}/access-scope
```

Essas APIs exigem permissao master `support:tenants`.
