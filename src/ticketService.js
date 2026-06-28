import { randomId } from "./util.js";

export class TicketService {
  constructor(store, logger) {
    this.store = store;
    this.logger = logger;
  }

  createTicket({
    tenantId,
    contactId,
    conversationId,
    firstMessage,
    contactName = "Cliente",
    aiClassification = null
  }) {
    if (!tenantId || !contactId || !conversationId) {
      throw new Error("tenantId, contactId, conversationId são obrigatórios");
    }

    const ticket = {
      id: `tk_${randomId()}`,
      tenantId,
      contactId,
      conversationId,
      assignedAnalystId: null,
      status: "open",
      priority: aiClassification?.priority || "medium",
      category: aiClassification?.category || "support",
      subject: aiClassification?.subject || firstMessage.substring(0, 100),
      slaDueAt: this._calculateSla(),
      openedAt: new Date().toISOString(),
      firstResponseAt: null,
      closedAt: null,
      closedBy: null,
      closureNote: null,
      timeTracking: {
        status: "stopped",
        accumulatedSeconds: 0,
        lastStartedAt: null
      },
      aiClassification: aiClassification ? {
        model: aiClassification.model || "claude-haiku-4-5-20251001",
        confidence: aiClassification.confidence || 0,
        reasoning: aiClassification.reasoning || "",
        classifiedAt: new Date().toISOString()
      } : null,
      logs: [
        {
          type: "created",
          note: `Ticket criado a partir de mensagem: "${firstMessage.substring(0, 50)}..."`,
          actor: "system",
          createdAt: new Date().toISOString(),
          metadata: { contactName }
        }
      ]
    };

    this.store.insert("tickets", ticket);
    return ticket;
  }

  assignTicket(ticketId, analystId, tenantId, actor = "system") {
    const ticket = this.store.findById("tickets", ticketId);
    if (!ticket || ticket.tenantId !== tenantId) {
      throw new Error("Ticket not found");
    }

    const updated = this.store.update("tickets", ticketId, {
      assignedAnalystId: analystId
    });

    this._addLog(ticketId, {
      type: "assigned",
      note: `Ticket atribuído a analista`,
      actor,
      metadata: { analystId }
    });

    return updated;
  }

  closeTicket(ticketId, tenantId, closureNote = "", closedBy = "system", closureSubject = "") {
    const ticket = this.store.findById("tickets", ticketId);
    if (!ticket || ticket.tenantId !== tenantId) {
      throw new Error("Ticket not found");
    }

    // Para o cronômetro automaticamente ao encerrar o atendimento.
    const timeTracking = this._finalizeTimer(ticket.timeTracking, "stopped");

    const closeSubj = String(closureSubject || "").trim();
    const updated = this.store.update("tickets", ticketId, {
      status: "closed",
      closedAt: new Date().toISOString(),
      closedBy,
      closureNote,
      closureSubject: closeSubj,
      // Se informou um título no encerramento, usa como assunto do ticket.
      subject: closeSubj || ticket.subject,
      timeTracking
    });

    this._addLog(ticketId, {
      type: "closed",
      note: `Ticket fechado${closureNote ? ": " + closureNote : ""}`,
      actor: closedBy,
      metadata: { closureNote, totalSeconds: timeTracking.accumulatedSeconds }
    });

    return updated;
  }

  // ===== Cronômetro de atendimento (controle de horas) =====
  setTimer(ticketId, tenantId, action, actor = "system") {
    const ticket = this.store.findById("tickets", ticketId);
    if (!ticket || ticket.tenantId !== tenantId) {
      throw new Error("Ticket not found");
    }
    if (!["start", "pause", "stop"].includes(action)) {
      throw new Error("Ação de cronômetro inválida");
    }

    let tt = ticket.timeTracking || { status: "stopped", accumulatedSeconds: 0, lastStartedAt: null };
    if (action === "start") {
      if (tt.status !== "running") {
        tt = { ...tt, status: "running", lastStartedAt: new Date().toISOString() };
      }
    } else {
      tt = this._finalizeTimer(tt, action === "pause" ? "paused" : "stopped");
    }

    const updated = this.store.update("tickets", ticketId, { timeTracking: tt });
    this._addLog(ticketId, {
      type: `timer_${action}`,
      note: `Cronômetro ${action === "start" ? "iniciado" : action === "pause" ? "pausado" : "encerrado"}`,
      actor,
      metadata: { accumulatedSeconds: tt.accumulatedSeconds }
    });
    return updated;
  }

  // Consolida o tempo corrido no acumulado e define o novo status.
  _finalizeTimer(tt, nextStatus) {
    const current = tt || { status: "stopped", accumulatedSeconds: 0, lastStartedAt: null };
    let accumulated = current.accumulatedSeconds || 0;
    if (current.status === "running" && current.lastStartedAt) {
      accumulated += Math.max(0, Math.floor((Date.now() - new Date(current.lastStartedAt).getTime()) / 1000));
    }
    return { status: nextStatus, accumulatedSeconds: accumulated, lastStartedAt: null };
  }

  transferTicket(ticketId, newAnalystId, tenantId, actor = "system") {
    const ticket = this.store.findById("tickets", ticketId);
    if (!ticket || ticket.tenantId !== tenantId) {
      throw new Error("Ticket not found");
    }

    const oldAnalystId = ticket.assignedAnalystId;
    const updated = this.store.update("tickets", ticketId, {
      assignedAnalystId: newAnalystId
    });

    this._addLog(ticketId, {
      type: "transferred",
      note: `Ticket transferido de analista`,
      actor,
      metadata: { fromAnalystId: oldAnalystId, toAnalystId: newAnalystId }
    });

    return updated;
  }

  setTicketStatus(ticketId, tenantId, status, actor = "system", note = "") {
    const ticket = this.store.findById("tickets", ticketId);
    if (!ticket || ticket.tenantId !== tenantId) {
      throw new Error("Ticket not found");
    }

    if (!["open", "waiting_customer", "waiting_analyst", "closed"].includes(status)) {
      throw new Error("Status inválido");
    }

    const updated = this.store.update("tickets", ticketId, { status });

    if (status !== "open" && !ticket.firstResponseAt) {
      this.store.update("tickets", ticketId, { firstResponseAt: new Date().toISOString() });
    }

    this._addLog(ticketId, {
      type: "status_changed",
      note: `Status alterado para: ${status}${note ? " - " + note : ""}`,
      actor,
      metadata: { newStatus: status }
    });

    return updated;
  }

  listOpenTickets(tenantId, filters = {}) {
    const tickets = this.store.findAll("tickets", t => t.tenantId === tenantId && t.status !== "closed");
    let result = tickets;

    if (filters.status) {
      result = result.filter(t => t.status === filters.status);
    }
    if (filters.priority) {
      result = result.filter(t => t.priority === filters.priority);
    }
    if (filters.category) {
      result = result.filter(t => t.category === filters.category);
    }
    if (filters.assignedAnalystId) {
      result = result.filter(t => t.assignedAnalystId === filters.assignedAnalystId);
    }

    return result.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const priorityDiff = (priorityOrder[a.priority] ?? 99) - (priorityOrder[b.priority] ?? 99);
      if (priorityDiff !== 0) return priorityDiff;
      return new Date(b.openedAt) - new Date(a.openedAt);
    });
  }

  getTicket(ticketId, tenantId) {
    const ticket = this.store.findById("tickets", ticketId);
    if (!ticket || ticket.tenantId !== tenantId) {
      return null;
    }
    return ticket;
  }

  addLog(ticketId, tenantId, log) {
    const ticket = this.store.findById("tickets", ticketId);
    if (!ticket || ticket.tenantId !== tenantId) {
      throw new Error("Ticket not found");
    }

    return this._addLog(ticketId, log);
  }

  _addLog(ticketId, logEntry) {
    const ticket = this.store.findById("tickets", ticketId);
    if (!ticket) return null;

    const log = {
      type: logEntry.type || "note",
      note: logEntry.note || "",
      actor: logEntry.actor || "system",
      createdAt: new Date().toISOString(),
      metadata: logEntry.metadata || {}
    };

    ticket.logs = ticket.logs || [];
    ticket.logs.push(log);
    this.store.update("tickets", ticketId, { logs: ticket.logs });

    return log;
  }

  _calculateSla(hours = 24) {
    const now = new Date();
    now.setHours(now.getHours() + hours);
    return now.toISOString();
  }
}
