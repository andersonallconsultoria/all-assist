# Meta WhatsApp Cloud API

## Configuracao necessaria

No Meta Developers / WhatsApp Cloud API, precisamos obter:

- `META_PHONE_NUMBER_ID`: ID do numero do WhatsApp Business.
- `META_ACCESS_TOKEN`: token com permissao de envio.
- `META_WEBHOOK_VERIFY_TOKEN`: token livre definido por nos para validar o webhook.
- `META_APP_SECRET`: segredo do app para validar assinatura `X-Hub-Signature-256`.

No `.env`:

```env
META_GRAPH_VERSION=v23.0
META_PHONE_NUMBER_ID=
META_ACCESS_TOKEN=
META_WEBHOOK_VERIFY_TOKEN=change-me
META_APP_SECRET=
META_MARK_INBOUND_READ=true
```

## Webhook para configurar na Meta

URL:

```text
https://seu-dominio.com/webhooks/meta/whatsapp
```

Campo de assinatura/evento:

```text
messages
```

## Recebimento de mensagens

Quando o cliente envia mensagem:

1. A Meta chama `POST /webhooks/meta/whatsapp`.
2. O CRM valida assinatura se `META_APP_SECRET` estiver configurado.
3. O CRM cria/reaproveita contato pelo telefone.
4. O CRM cria/reaproveita uma conversa aberta.
5. O CRM salva a mensagem inbound.
6. Opcionalmente marca a mensagem como lida na Meta.

## Envio de mensagens

Endpoint interno:

```http
POST /api/conversations/{conversationId}/messages
Content-Type: application/json

{
  "body": "Mensagem para o cliente"
}
```

Se a Meta estiver configurada, o CRM envia via:

```text
POST https://graph.facebook.com/{version}/{phone-number-id}/messages
```

## Observacao importante

Para mensagens ativas fora da janela de atendimento do WhatsApp, a Meta exige templates aprovados.
O envio livre de texto e indicado para respostas dentro da janela de conversa aberta pelo cliente.
