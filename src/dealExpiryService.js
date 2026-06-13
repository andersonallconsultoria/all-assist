const EXPIRED_STAGE = "Vencidos";
const WARNING_DAYS_DEFAULT = 2;

export class DealExpiryService {
  constructor({ store, crmService, logger }) {
    this.store = store;
    this.crmService = crmService;
    this.logger = logger;
  }

  runOnce() {
    const today = todayStr();
    const tenants = this.store.list("tenants");

    for (const tenant of tenants) {
      const warningDays = Number(tenant.expiryWarningDays ?? WARNING_DAYS_DEFAULT);
      const deals = this.store.list("deals").filter(
        (d) => d.tenantId === tenant.id && d.validUntil && d.stage !== EXPIRED_STAGE && !isTerminalStage(d.stage)
      );

      for (const deal of deals) {
        const daysLeft = diffDays(today, deal.validUntil);
        if (daysLeft < 0) {
          this.store.update("deals", deal.id, { stage: EXPIRED_STAGE, expiredAt: today });
          this.crmService.addDealLog(deal.id, {
            type: "expired",
            note: `Orçamento/pedido venceu em ${formatBr(deal.validUntil)}`,
            actor: "system",
            metadata: { validUntil: deal.validUntil }
          });
          this.logger.info("deal_expired", { dealId: deal.id, validUntil: deal.validUntil });
        }
      }
    }

    this.store.save();
  }
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function diffDays(from, to) {
  const a = new Date(from);
  const b = new Date(to);
  return Math.floor((b - a) / 86400000);
}

function isTerminalStage(stage) {
  const s = String(stage || "").toLowerCase();
  return s.includes("negado") || s.includes("efetivada") || s.includes("fiscal");
}

function formatBr(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}
