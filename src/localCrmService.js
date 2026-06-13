import {
  buildOrderCustomFields,
  buildOrderUpdatePayload,
  extractPhone,
  getOriginQuoteId,
  getSourceKey,
  getStatusKey
} from "./mapper.js";

export class LocalCrmService {
  constructor(store, config, logger) {
    this.store = store;
    this.config = config;
    this.logger = logger;
  }

  upsertContactFromCiss(record, tenantId = defaultTenantId(this.store)) {
    const phone = extractPhone(record);
    const now = new Date().toISOString();
    let contact = this.store.findOne("contacts", (item) => item.tenantId === tenantId && item.phone === phone);

    const patch = {
      tenantId,
      name: clean(record.nome) || `Cliente ${record.idclifor}`,
      phone,
      email: clean(record.email) || "",
      city: clean(record.descrcidade),
      state: clean(record.uf),
      document: clean(record.cnpjcpf),
      externalCustomerId: String(record.idclifor || ""),
      source: "ciss",
      lastSeenAt: now
    };

    if (contact) {
      contact = this.store.update("contacts", contact.id, patch);
    } else {
      contact = this.store.insert("contacts", patch);
    }

    return contact;
  }

  upsertDealFromCiss(record, tenantId = defaultTenantId(this.store)) {
    const sourceKey = getSourceKey(record);
    const contact = this.upsertContactFromCiss(record, tenantId);
    const orderPayload = buildOrderUpdatePayload(record, this.config);
    const customFields = buildOrderCustomFields(record);
    const pipeline = this.resolvePipelineForCissRecord(record, tenantId);
    let deal = this.store.findOne("deals", (item) => item.tenantId === tenantId && item.externalKey === sourceKey);

    const patch = {
      tenantId,
      pipelineId: pipeline.id,
      pipelineName: pipeline.name,
      externalKey: sourceKey,
      externalOrderId: String(record.idorcamento || ""),
      companyId: String(record.idempresa || ""),
      contactId: contact.id,
      contactName: contact.name,
      contactPhone: contact.phone,
      title: `${record.desrdav || "Pedido"} ${record.idorcamento} - ${contact.name}`,
      amount: Number(record.valtotliquido || 0),
      stage: orderPayload.step,
      status: getStatusKey(record),
      source: "ciss",
      assignedSeller: clean(record.vendedores),
      cissUser: clean(record.usuario),
      movementDate: clean(record.dtmovimento),
      validUntil: clean(record.dtvalidade),
      customFields,
      sourceRecord: cloneRecord(record)
    };

    if (deal) {
      const previousStage = deal.stage;
      const changedStage = previousStage !== patch.stage;
      const changedFields = diffErpRecord(deal.sourceRecord, record);

      // Se o deal já existe mas ainda não tem vínculo com orçamento origem, resolver agora
      if (!deal.originQuoteId) {
        const originQuoteNumber = getOriginQuoteId(record);
        if (originQuoteNumber) {
          const quoteDeal = this.store.findOne(
            "deals",
            (d) => d.tenantId === tenantId && d.externalOrderId === originQuoteNumber
          );
          if (quoteDeal) {
            patch.originQuoteId = quoteDeal.id;
            const quoteAlreadyEffective = String(quoteDeal.stage || "")
              .toLowerCase()
              .includes("efetivada");
            if (!quoteAlreadyEffective) {
              this.store.update("deals", quoteDeal.id, { stage: "Venda efetivada" });
              this.addDealLog(quoteDeal.id, {
                type: "quote_converted",
                note: `Orçamento efetivado — originou o Pedido de Venda #${record.idorcamento}`,
                actor: "system",
                metadata: {
                  originatedOrderId: String(record.idorcamento),
                  originatedOrderKey: sourceKey
                }
              });
            }
            this.addDealLog(deal.id, {
              type: "created",
              note: `Pedido de Venda vinculado ao Orçamento #${originQuoteNumber}`,
              actor: "system",
              metadata: { originQuoteId: quoteDeal.id, originQuoteNumber }
            });
          }
        }
      }

      deal = this.store.update("deals", deal.id, patch);
      if (changedStage) {
        this.addDealLog(deal.id, {
          type: "stage_changed",
          note: `Etapa alterada para ${patch.stage}`,
          actor: "system",
          metadata: {
            previousStage,
            nextStage: patch.stage
          }
        });
      }
      if (changedFields.length > 0) {
        this.addDealLog(deal.id, {
          type: "erp_updated",
          note: "Dados atualizados pelo ERP",
          actor: "system",
          metadata: { changes: changedFields }
        });
      }
    } else {
      const originQuoteNumber = getOriginQuoteId(record);
      let originQuoteDealId = null;

      if (originQuoteNumber) {
        const quoteDeal = this.store.findOne(
          "deals",
          (d) => d.tenantId === tenantId && d.externalOrderId === originQuoteNumber
        );
        if (quoteDeal) {
          originQuoteDealId = quoteDeal.id;
          const quoteAlreadyEffective = String(quoteDeal.stage || "")
            .toLowerCase()
            .includes("efetivada");
          if (!quoteAlreadyEffective) {
            this.store.update("deals", quoteDeal.id, { stage: "Venda efetivada" });
            this.addDealLog(quoteDeal.id, {
              type: "quote_converted",
              note: `Orçamento efetivado — originou o Pedido de Venda #${record.idorcamento}`,
              actor: "system",
              metadata: {
                originatedOrderId: String(record.idorcamento),
                originatedOrderKey: sourceKey
              }
            });
          }
        }
      }

      deal = this.store.insert("deals", {
        ...patch,
        originQuoteId: originQuoteDealId,
        nextContactAt: "",
        lastContactAt: "",
        lostReason: "",
        wonAt: "",
        lostAt: ""
      });

      const createdNote = originQuoteDealId
        ? `Pedido de Venda criado — originado do Orçamento #${originQuoteNumber}`
        : "Negocio criado a partir do ERP";

      this.addDealLog(deal.id, {
        type: "created",
        note: createdNote,
        actor: "system",
        metadata: {
          sourceKey,
          ...(originQuoteDealId ? { originQuoteId: originQuoteDealId, originQuoteNumber } : {})
        }
      });
    }

    return { contact, deal };
  }

  addDealLog(dealId, { type = "note", note, nextContactAt = "", actor = "user", metadata = {} }, tenantId = "") {
    const deal = this.store.findById("deals", dealId);
    if (!deal) return null;
    if (tenantId && deal.tenantId !== tenantId) return null;

    const log = this.store.insert("dealLogs", {
      tenantId: deal.tenantId || defaultTenantId(this.store),
      dealId,
      type,
      note: clean(note),
      actor,
      nextContactAt,
      metadata
    });

    const patch = {};
    if (type === "contact") patch.lastContactAt = new Date().toISOString();
    if (nextContactAt) patch.nextContactAt = nextContactAt;
    if (Object.keys(patch).length) this.store.update("deals", dealId, patch);

    return log;
  }

  listDeals(filters = {}, tenantId = "") {
    let deals = this.store.list("deals");
    if (tenantId) deals = deals.filter((deal) => deal.tenantId === tenantId);
    if (filters.pipelineId) deals = deals.filter((deal) => this.dealPipelineId(deal, tenantId) === filters.pipelineId);
    if (filters.stage) deals = deals.filter((deal) => deal.stage === filters.stage);
    if (filters.status) deals = deals.filter((deal) => deal.status === filters.status);
    if (filters.seller) deals = deals.filter((deal) => deal.assignedSeller?.includes(filters.seller));
    if (filters.q) {
      const q = filters.q.toLowerCase();
      deals = deals.filter((deal) => `${deal.title} ${deal.contactName} ${deal.contactPhone} ${deal.externalOrderId}`.toLowerCase().includes(q));
    }
    return deals.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }

  getDeal(id, tenantId = "") {
    const deal = this.store.findById("deals", id);
    if (!deal) return null;
    if (tenantId && deal.tenantId !== tenantId) return null;
    return {
      ...deal,
      contact: this.store.findById("contacts", deal.contactId),
      logs: this.store.list("dealLogs").filter((log) => log.dealId === id && (!tenantId || log.tenantId === tenantId))
    };
  }

  getDashboard(tenantId = "") {
    const deals = this.store.list("deals").filter((deal) => !tenantId || deal.tenantId === tenantId);
    const totalOpen = deals.filter((deal) => !["GANHO", "PERDIDO"].includes(deal.status));
    const amountOpen = totalOpen.reduce((sum, deal) => sum + Number(deal.amount || 0), 0);
    const byStage = groupBy(deals, "stage");
    const bySeller = groupBy(deals, "assignedSeller");
    const conversationsOpen = this.store
      .list("conversations")
      .filter((conversation) => (!tenantId || conversation.tenantId === tenantId) && conversation.status !== "closed");

    return {
      deals: {
        total: deals.length,
        open: totalOpen.length,
        amountOpen,
        byStage,
        bySeller
      },
      contacts: {
        total: this.store.list("contacts").filter((contact) => !tenantId || contact.tenantId === tenantId).length
      },
      conversations: {
        open: conversationsOpen.length,
        total: this.store.list("conversations").filter((conversation) => !tenantId || conversation.tenantId === tenantId).length
      }
    };
  }

  listPipelines(tenantId = defaultTenantId(this.store)) {
    this.ensureDefaultPipelines(tenantId);
    return this.store
      .list("pipelines")
      .filter((pipeline) => pipeline.tenantId === tenantId)
      .sort((a, b) => Number(a.order || 0) - Number(b.order || 0) || String(a.createdAt).localeCompare(String(b.createdAt)));
  }

  createPipeline({ name, stages = [] }, tenantId = defaultTenantId(this.store)) {
    const cleanName = clean(name);
    if (!cleanName) throw new Error("pipeline_name_required");

    const existing = this.store.findOne("pipelines", (pipeline) => (
      pipeline.tenantId === tenantId && normalizeText(pipeline.name) === normalizeText(cleanName)
    ));
    if (existing) throw new Error("pipeline_already_exists");

    const pipeline = this.store.insert("pipelines", {
      tenantId,
      name: cleanName,
      kind: "custom",
      isSystemDefault: false,
      order: this.listPipelines(tenantId).length + 1,
      stages: normalizeStages(stages)
    });
    this.store.save();
    return pipeline;
  }

  updatePipeline(id, { name, stages }, tenantId = defaultTenantId(this.store)) {
    const pipeline = this.store.findById("pipelines", id);
    if (!pipeline || pipeline.tenantId !== tenantId) return null;

    const patch = {};
    if (name !== undefined) {
      const cleanName = clean(name);
      if (!cleanName) throw new Error("pipeline_name_required");
      patch.name = cleanName;
    }
    if (stages !== undefined) patch.stages = normalizeStages(stages);

    const updated = this.store.update("pipelines", id, patch);
    this.store.save();
    return updated;
  }

  resolvePipelineForCissRecord(record, tenantId = defaultTenantId(this.store)) {
    this.ensureDefaultPipelines(tenantId);
    const kind = getDealKindFromText(record.desrdav || record.tipoDocumento || record.title) === "quote" ? "quote" : "order";
    return this.store.findOne("pipelines", (pipeline) => pipeline.tenantId === tenantId && pipeline.kind === kind)
      || this.listPipelines(tenantId)[0];
  }

  dealPipelineId(deal, tenantId = defaultTenantId(this.store)) {
    if (deal.pipelineId) return deal.pipelineId;
    const kind = getDealKindFromText(`${deal.customFields?.tipoDocumento || ""} ${deal.sourceRecord?.desrdav || ""} ${deal.title || ""}`);
    return `pipe_${deal.tenantId || tenantId}_${kind === "quote" ? "quotes" : "orders"}`;
  }

  ensureDefaultPipelines(tenantId = defaultTenantId(this.store)) {
    const now = new Date().toISOString();
    const existing = this.store.list("pipelines").filter((pipeline) => pipeline.tenantId === tenantId);
    if (!existing.some((pipeline) => pipeline.kind === "quote")) {
      this.store.insert("pipelines", defaultPipeline(tenantId, "quote", "Orcamentos", now));
    }
    if (!existing.some((pipeline) => pipeline.kind === "order")) {
      this.store.insert("pipelines", defaultPipeline(tenantId, "order", "Pedidos", now));
    }
  }
}

function groupBy(records, field) {
  return records.reduce((acc, record) => {
    const key = record[field] || "Sem informacao";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function clean(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function cloneRecord(record) {
  return Object.fromEntries(
    Object.keys(record || {})
      .sort()
      .map((key) => [key, record[key]])
  );
}

function defaultTenantId(store) {
  return store.list("tenants")[0]?.id || "tenant_default";
}

function defaultPipeline(tenantId, kind, name, now) {
  return {
    id: `pipe_${tenantId}_${kind === "quote" ? "quotes" : "orders"}`,
    tenantId,
    createdAt: now,
    updatedAt: now,
    name,
    kind,
    isSystemDefault: true,
    stages: normalizeStages([])
  };
}

function normalizeStages(stages) {
  const names = Array.isArray(stages) && stages.length
    ? stages.map((stage) => (typeof stage === "string" ? stage : stage?.name))
    : [
        "Entrada",
        "Aguardando contato",
        "Em negociacao",
        "Venda efetivada",
        "Gerou documento fiscal",
        "Pedido negado"
      ];

  return [...new Set(names.map(clean).filter(Boolean))]
    .map((name, index) => ({
      id: `stage_${index + 1}`,
      name,
      order: index + 1,
      color: ""
    }));
}

function getDealKindFromText(value) {
  const text = normalizeText(value);
  if (text.includes("orcamento")) return "quote";
  return "order";
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

const ERP_FIELD_LABELS = {
  idempresa: "Empresa",
  idorcamento: "N\u00ba Or\u00e7amento",
  dtmovimento: "Data Movimento",
  dtvalidade: "Data Validade",
  valtotliquido: "Valor Total L\u00edquido",
  idclifor: "ID Cliente/Fornecedor",
  nome: "Nome",
  fonecelular: "Celular",
  fone1: "Telefone",
  email: "E-mail",
  cnpjcpf: "CNPJ/CPF",
  descrcidade: "Cidade",
  uf: "UF",
  status: "Status",
  statusgestao: "Status Gest\u00e3o",
  idsituacaogestao: "Situa\u00e7\u00e3o Gest\u00e3o",
  flagaprovado: "Flag Aprovado",
  flagprenota: "Flag Pr\u00e9-Nota",
  flagprenotapaga: "Flag Pr\u00e9-Nota Paga",
  flagpedidodenegado: "Flag Pedido Negado",
  vendedores: "Vendedor",
  usuario: "Usu\u00e1rio",
  desrdav: "Tipo Documento",
  valorc: "Valor Custo",
  numero: "N\u00famero",
  idregiao: "Regi\u00e3o",
  inscrestadual: "Inscri\u00e7\u00e3o Estadual"
};

function diffErpRecord(previous, next) {
  if (!previous || !next) return [];
  const changes = [];
  const allKeys = new Set([...Object.keys(previous), ...Object.keys(next)]);
  for (const key of allKeys) {
    const before = String(previous[key] ?? "").trim();
    const after = String(next[key] ?? "").trim();
    if (before !== after) {
      changes.push({
        field: key,
        label: ERP_FIELD_LABELS[key] || key,
        before,
        after
      });
    }
  }
  return changes;
}
