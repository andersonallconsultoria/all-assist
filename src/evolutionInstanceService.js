// Limites de mensagens por dia durante o aquecimento progressivo do número
const WARMUP_STAGES = [
  { maxDays: 3,        limit: 20 },
  { maxDays: 7,        limit: 50 },
  { maxDays: 14,       limit: 100 },
  { maxDays: 30,       limit: 200 },
  { maxDays: Infinity, limit: 500 }
];

const OPT_OUT_PHRASES = ["parar", "stop", "cancelar", "remover", "sair", "não quero", "nao quero", "descadastrar"];

export const DEFAULT_ANTI_BAN = {
  maxPerHour: 60,
  maxPerDay: 300,
  minDelayMs: 2000,
  maxDelayMs: 8000,
  hoursStart: 8,
  hoursEnd: 20,
  warmupEnabled: true,
  typingIndicator: true,
  blockOptedOut: true
};

export const ANTI_BAN_TIPS = [
  "Use apenas números com chip ativo há pelo menos 30 dias",
  "Nunca envie para listas compradas — apenas contatos que interagiram antes",
  "Evite mensagens idênticas em sequência — varie o texto",
  "Respeite o horário comercial configurado (padrão 8h–20h)",
  "Textos em MAIÚSCULAS, excesso de ! e múltiplos links aumentam risco",
  "O modo de aquecimento limita o volume nos primeiros dias — não desative",
  "Sempre ofereça uma forma de opt-out ('responda PARAR para não receber mais')",
  "Não envie mais de 1 mensagem por minuto para o mesmo número"
];

export class EvolutionInstanceService {
  constructor(store, logger) {
    this.store = store;
    this.logger = logger;
  }

  // ─── Configuração do servidor (admin configura 1x por tenant) ──────

  getTenantConfig(tenantId) {
    return this.store.findOne("evolutionTenantConfig", (c) => c.tenantId === tenantId) || null;
  }

  saveTenantConfig(tenantId, data) {
    const existing = this.getTenantConfig(tenantId);
    const now = new Date().toISOString();
    if (existing) {
      const updated = this.store.update("evolutionTenantConfig", existing.id, { ...data, updatedAt: now });
      this.store.save();
      return updated;
    }
    const inserted = this.store.insert("evolutionTenantConfig", { tenantId, ...data, createdAt: now });
    this.store.save();
    return inserted;
  }

  // ─── Instâncias por usuário ──────────────────────────────────────

  getByUser(tenantId, userId) {
    return this.store.findOne("evolutionInstances", (i) => i.tenantId === tenantId && i.userId === userId) || null;
  }

  listByTenant(tenantId) {
    return this.store.list("evolutionInstances").filter((i) => i.tenantId === tenantId);
  }

  saveForUser(tenantId, userId, data) {
    const existing = this.getByUser(tenantId, userId);
    const now = new Date().toISOString();
    if (existing) {
      const updated = this.store.update("evolutionInstances", existing.id, { ...data, updatedAt: now });
      this.store.save();
      return updated;
    }
    const inserted = this.store.insert("evolutionInstances", {
      tenantId,
      userId,
      status: "disconnected",
      warmupStartedAt: now,
      antiBan: DEFAULT_ANTI_BAN,
      stats: {},
      optedOut: [],
      ...data,
      createdAt: now
    });
    this.store.save();
    return inserted;
  }

  // ─── Instância legada (tenant-wide, sem userId) ──────────────────

  getByTenant(tenantId) {
    return this.store.findOne("evolutionInstances", (i) => i.tenantId === tenantId) || null;
  }

  getById(id) {
    return this.store.findById("evolutionInstances", id) || null;
  }

  save(tenantId, data) {
    const existing = this.getByTenant(tenantId);
    const now = new Date().toISOString();
    if (existing) {
      const updated = this.store.update("evolutionInstances", existing.id, { ...data, updatedAt: now });
      this.store.save();
      return updated;
    }
    // Marca início do aquecimento ao criar pela primeira vez
    const inserted = this.store.insert("evolutionInstances", {
      tenantId,
      status: "disconnected",
      warmupStartedAt: now,
      antiBan: DEFAULT_ANTI_BAN,
      stats: {},
      optedOut: [],
      ...data,
      createdAt: now
    });
    this.store.save();
    return inserted;
  }

  updateStatus(instanceId, status, extra = {}) {
    const patch = { status, ...extra };
    if (status === "connected") patch.connectedAt = new Date().toISOString();
    const updated = this.store.update("evolutionInstances", instanceId, patch);
    this.store.save();
    return updated;
  }

  // ─── Anti-ban ───────────────────────────────────────────────

  canSend(instance) {
    const ab = { ...DEFAULT_ANTI_BAN, ...(instance.antiBan || {}) };
    // Hora em Brasília (o container roda em UTC; sem isso a janela 8h–20h
    // ficaria 3h adiantada e bloquearia envios no fim da tarde).
    const hour = Number(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false, hourCycle: "h23" }));

    if (hour < ab.hoursStart || hour >= ab.hoursEnd) {
      return {
        allowed: false,
        reason: `Envio bloqueado fora do horário permitido (${ab.hoursStart}h–${ab.hoursEnd}h)`
      };
    }

    const stats = this._currentStats(instance);
    const dailyLimit = ab.warmupEnabled
      ? this._warmupDailyLimit(instance, ab.maxPerDay)
      : ab.maxPerDay;

    if (stats.sentThisHour >= ab.maxPerHour) {
      return { allowed: false, reason: `Limite por hora atingido (${ab.maxPerHour} msgs/h). Aguarde a próxima hora.` };
    }

    if (stats.sentToday >= dailyLimit) {
      const warmupNote = ab.warmupEnabled ? " — modo aquecimento ativo" : "";
      return { allowed: false, reason: `Limite diário atingido (${dailyLimit} msgs/dia${warmupNote})` };
    }

    return { allowed: true, reason: null, dailyLimit, sentToday: stats.sentToday, sentThisHour: stats.sentThisHour };
  }

  recordSent(instanceId) {
    const instance = this.store.findById("evolutionInstances", instanceId);
    if (!instance) return;
    const stats = this._currentStats(instance);
    const now = new Date();
    const todayKey = now.toISOString().slice(0, 10);
    const hourKey = `${todayKey}T${String(now.getHours()).padStart(2, "0")}`;
    this.store.update("evolutionInstances", instanceId, {
      stats: {
        sentToday: stats.sentToday + 1,
        sentThisHour: stats.sentThisHour + 1,
        lastResetDay: todayKey,
        lastResetHour: hourKey
      }
    });
    this.store.save();
  }

  randomDelay(instance) {
    const ab = { ...DEFAULT_ANTI_BAN, ...(instance.antiBan || {}) };
    return Math.floor(ab.minDelayMs + Math.random() * (ab.maxDelayMs - ab.minDelayMs));
  }

  isOptedOut(instance, phone) {
    if (!instance.antiBan?.blockOptedOut) return false;
    return (instance.optedOut || []).includes(normalizePhone(phone));
  }

  checkOptOutPhrase(text) {
    if (!text) return false;
    const lower = text.toLowerCase().trim();
    return OPT_OUT_PHRASES.some((phrase) => lower.includes(phrase));
  }

  addOptOut(instanceId, phone) {
    const instance = this.store.findById("evolutionInstances", instanceId);
    if (!instance) return;
    const normalized = normalizePhone(phone);
    const optedOut = [...new Set([...(instance.optedOut || []), normalized])];
    this.store.update("evolutionInstances", instanceId, { optedOut });
    this.store.save();
    this.logger.info("evolution_opt_out_registered", { instanceId, phone: normalized });
  }

  contentWarnings(text) {
    const warnings = [];
    if (!text) return warnings;
    if (text.length > 10 && text === text.toUpperCase()) {
      warnings.push("Texto totalmente em MAIÚSCULAS aumenta risco de marcação como spam");
    }
    if ((text.match(/!/g) || []).length > 3) {
      warnings.push("Excesso de exclamações (!) pode parecer spam");
    }
    if ((text.match(/https?:\/\//g) || []).length > 1) {
      warnings.push("Múltiplos links em uma mesma mensagem aumentam risco de bloqueio");
    }
    const riskyWords = ["grátis", "gratis", "clique aqui", "oferta imperdível", "ganhe dinheiro", "não perca", "urgente", "promoção"];
    for (const word of riskyWords) {
      if (text.toLowerCase().includes(word)) {
        warnings.push(`Palavra de risco detectada: "${word}"`);
      }
    }
    if (text.length < 10) {
      warnings.push("Mensagens muito curtas podem parecer automatizadas — considere um texto mais natural");
    }
    return warnings;
  }

  warmupStatus(instance) {
    if (!instance.warmupStartedAt) return { active: true, daysSince: 0, dailyLimit: 20 };
    const daysSince = Math.floor((Date.now() - new Date(instance.warmupStartedAt).getTime()) / 86_400_000);
    const ab = { ...DEFAULT_ANTI_BAN, ...(instance.antiBan || {}) };
    const dailyLimit = this._warmupDailyLimit(instance, ab.maxPerDay);
    const graduated = daysSince >= 30;
    return { active: !graduated, daysSince, dailyLimit };
  }

  _warmupDailyLimit(instance, configuredMax) {
    if (!instance.warmupStartedAt) return WARMUP_STAGES[0].limit;
    const daysSince = Math.floor((Date.now() - new Date(instance.warmupStartedAt).getTime()) / 86_400_000);
    const stage = WARMUP_STAGES.find((s) => daysSince < s.maxDays);
    return Math.min(stage?.limit ?? 500, configuredMax);
  }

  _currentStats(instance) {
    const now = new Date();
    const todayKey = now.toISOString().slice(0, 10);
    const hourKey = `${todayKey}T${String(now.getHours()).padStart(2, "0")}`;
    const stats = instance.stats || {};
    return {
      sentToday: stats.lastResetDay === todayKey ? (stats.sentToday || 0) : 0,
      sentThisHour: stats.lastResetHour === hourKey ? (stats.sentThisHour || 0) : 0
    };
  }
}

function normalizePhone(phone) {
  return String(phone || "").replace(/\D/g, "");
}
