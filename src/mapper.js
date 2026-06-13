import crypto from "node:crypto";

export function getSourceKey(record) {
  return `${record.idempresa}:${record.idorcamento}`;
}

export function extractPhone(record) {
  const candidates = [
    record.fonecelular,
    record.fone1
  ].filter(Boolean);

  for (const candidate of candidates) {
    const phone = bestPhoneFromText(String(candidate));
    if (phone) return phone;
  }

  return "";
}

function bestPhoneFromText(text) {
  const groups = text.match(/\d{8,13}/g) || [];
  const normalized = groups
    .map(normalizePhone)
    .filter((value) => value.length >= 10 && value.length <= 11);

  return normalized.sort((a, b) => b.length - a.length)[0] || "";
}

function normalizePhone(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) {
    digits = digits.slice(2);
  }
  return digits;
}

export function getStatusKey(record) {
  if (String(record.flagpedidodenegado || "").toUpperCase() === "T") return "NEGADO";
  return String(record.status || record.statusgestao || "PENDENTE").trim().toUpperCase();
}

export function mapStep(record, config) {
  const statusKey = getStatusKey(record);
  return config.crm.stageMap[statusKey] || config.crm.defaultStep;
}

export function buildLeadPayload(record, config) {
  const phone = extractPhone(record);
  const payload = {
    name: cleanText(record.nome) || `Cliente ${record.idclifor}`,
    phone
  };

  if (record.email) payload.email = cleanText(record.email).toLowerCase();

  if (config.crm.sendContactFields) {
    addIfValue(payload, "cidade", record.descrcidade);
    addIfValue(payload, "estado", record.uf);
    addIfValue(payload, "cnpjcpf", record.cnpjcpf);
    addIfValue(payload, "idClienteCiss", record.idclifor);
  }

  if (config.crm.sendOrderCustomFields) {
    Object.assign(payload, buildOrderCustomFields(record));
  }

  return payload;
}

export function buildOrderCustomFields(record) {
  return compactObject({
    idEmpresa: record.idempresa,
    numeroOrcamento: record.idorcamento,
    valorPedido: record.valtotliquido,
    dataMovimento: record.dtmovimento,
    dataValidade: record.dtvalidade,
    statusPedido: record.status,
    statusGestao: record.statusgestao,
    situacaoGestao: record.idsituacaogestao,
    tipoDocumento: record.desrdav,
    vendedorCiss: record.vendedores,
    usuarioCiss: record.usuario,
    flagAprovado: record.flagaprovado,
    flagPreNota: record.flagprenota,
    flagPreNotaPaga: record.flagprenotapaga,
    flagPedidoNegado: record.flagpedidodenegado,
    idOrcamentoOrigem: record.idorcamentoorigem2
  });
}

export function getOriginQuoteId(record) {
  const raw = String(record.idorcamentoorigem2 || "").trim();
  return raw && raw !== "0" ? raw : null;
}

export function buildOrderUpdatePayload(record, config) {
  const payload = {
    amount: Number(record.valtotliquido || 0),
    step: mapStep(record, config)
  };

  if (config.crm.defaultResponsible) {
    payload.responsible = config.crm.defaultResponsible;
  }

  return payload;
}

export function hashRecord(record) {
  const relevant = {
    idempresa: record.idempresa,
    idorcamento: record.idorcamento,
    dtmovimento: record.dtmovimento,
    valtotliquido: record.valtotliquido,
    idclifor: record.idclifor,
    nome: cleanText(record.nome),
    phone: extractPhone(record),
    descrcidade: cleanText(record.descrcidade),
    uf: cleanText(record.uf),
    cnpjcpf: cleanText(record.cnpjcpf),
    status: cleanText(record.status),
    statusgestao: cleanText(record.statusgestao),
    idsituacaogestao: record.idsituacaogestao,
    flagaprovado: cleanText(record.flagaprovado),
    flagprenota: cleanText(record.flagprenota),
    flagprenotapaga: cleanText(record.flagprenotapaga),
    flagpedidodenegado: cleanText(record.flagpedidodenegado),
    vendedores: cleanText(record.vendedores),
    usuario: cleanText(record.usuario),
    dtvalidade: record.dtvalidade,
    idorcamentoorigem2: record.idorcamentoorigem2
  };

  return crypto.createHash("sha256").update(stableJson(relevant)).digest("hex");
}

function addIfValue(target, key, value) {
  const cleaned = cleanText(value);
  if (cleaned) target[key] = cleaned;
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, nestedValue]) => [key, cleanText(nestedValue)])
      .filter(([, nestedValue]) => nestedValue !== "")
  );
}

function cleanText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
