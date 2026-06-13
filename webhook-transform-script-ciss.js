// O objeto `data` contem o payload recebido pelo webhook.
// Este script achata um payload estilo ERP/Ciss para o formato esperado pelo CRM.
// Campos extras retornados aqui tendem a virar campos personalizados do contato.

return {
  name: data.customer?.name || data.nome || data.name,
  phone: (
    data.customer?.phone ||
    data.telefone ||
    data.phone ||
    data.customer?.mobile
  ),
  email: data.customer?.email || data.email,

  pedidoNumero: data.order?.number,
  valorPedido: String(data.order?.amount ?? ""),
  cidade: data.order?.city || data.cidade,
  estado: data.order?.state || data.estado,
  origemPedido: data.metadata?.source || "ERP Ciss",
  observacaoTeste: data.metadata?.note
};
