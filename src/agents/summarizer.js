// Resume um atendimento para pré-preencher o título e o detalhamento no
// encerramento. Espelha o padrão do ClassifierAgent (Claude via fetch, tool
// use forçado). Sem API key ou em erro, cai num resumo heurístico — nunca lança.
export class SummarizerAgent {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.apiKey = config.anthropicApiKey;
    this.model = config.classifierModel || "claude-haiku-4-5-20251001";
  }

  async summarize({ contactName = "", messages = [] } = {}) {
    if (!this.apiKey) {
      this.logger?.warn?.("summarizer_api_key_missing", { message: "Usando resumo padrão" });
      return this._defaultSummary(messages);
    }

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 800,
          tools: [
            {
              name: "save_summary",
              description: "Salva o título e o detalhamento do atendimento",
              input_schema: {
                type: "object",
                properties: {
                  title: { type: "string", description: "Título curto do atendimento, até 80 caracteres" },
                  detail: { type: "string", description: "Detalhamento objetivo do que o cliente relatou e como foi resolvido/encaminhado" }
                },
                required: ["title", "detail"]
              }
            }
          ],
          tool_choice: { type: "tool", name: "save_summary" },
          messages: [{ role: "user", content: this._buildPrompt(contactName, messages) }],
          system: `Você resume atendimentos de suporte ao cliente para um sistema de tickets.
Com base no histórico da conversa, gere:
- title: um título curto e descritivo (até 80 caracteres) do assunto do atendimento
- detail: um detalhamento objetivo, em português, do que o cliente relatou e do que foi
  feito/resolvido/encaminhado. Escreva em tom profissional, em 2 a 5 frases. Não invente
  informações que não estejam na conversa.
Retorne SEMPRE usando a tool save_summary.`
        })
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        this.logger?.error?.("summarizer_api_error", { status: response.status, error: error.error?.message || error });
        return this._defaultSummary(messages);
      }

      const data = await response.json();
      const block = data.content?.find((b) => b.type === "tool_use");
      if (!block) return this._defaultSummary(messages);
      return {
        title: String(block.input.title || "").slice(0, 80),
        detail: String(block.input.detail || ""),
        model: this.model,
        generatedAt: new Date().toISOString(),
        ai: true
      };
    } catch (error) {
      this.logger?.error?.("summarizer_failed", { error: error.message });
      return this._defaultSummary(messages);
    }
  }

  _buildPrompt(contactName, messages) {
    let prompt = `Cliente: ${contactName || "(desconhecido)"}\n\nHistórico do atendimento:\n`;
    const text = messages
      .filter((m) => (m.body || "").trim())
      .map((m) => `[${m.direction === "outbound" ? "ATENDENTE" : "CLIENTE"}] ${(m.body || "").trim()}`)
      .join("\n");
    prompt += text || "(sem mensagens de texto)";
    return prompt;
  }

  _defaultSummary(messages) {
    const inbound = messages.filter((m) => m.direction === "inbound" && (m.body || "").trim());
    const first = inbound[0]?.body || messages.find((m) => (m.body || "").trim())?.body || "";
    const lastFew = messages.filter((m) => (m.body || "").trim()).slice(-4)
      .map((m) => `${m.direction === "outbound" ? "Atendente" : "Cliente"}: ${(m.body || "").trim()}`)
      .join("\n");
    return {
      title: (first || "Atendimento").slice(0, 80),
      detail: lastFew || "Atendimento concluído.",
      model: this.model,
      generatedAt: new Date().toISOString(),
      ai: false
    };
  }
}
