// Agente de apoio ao analista: dada a mensagem do cliente, analisa a base de
// conhecimento e sugere os artigos mais relevantes + uma orientação. Funciona
// sem ANTHROPIC_API_KEY (cai num ranqueamento por palavras-chave).
export class AssistantAgent {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.apiKey = config.anthropicApiKey;
    this.model = config.classifierModel || "claude-haiku-4-5-20251001";
  }

  async suggest({ message, articles }) {
    const base = (articles || []).filter((a) => a && a.title);
    if (!base.length) return { suggestions: [], guidance: "Nenhum artigo na base de conhecimento ainda.", source: "empty" };
    if (!this.apiKey) return this._keywordFallback(message, base);

    try {
      const catalog = base.map((a, i) =>
        `[${i}] id=${a.id} | ${a.title}${a.category ? ` (${a.category})` : ""}\n${(a.content || "").slice(0, 900)}${a.attachmentsText ? `\nAnexos: ${a.attachmentsText.slice(0, 400)}` : ""}`
      ).join("\n\n");

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": this.apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 700,
          tools: [{
            name: "suggest_articles",
            description: "Sugere os artigos da base de conhecimento relevantes para a mensagem do cliente",
            input_schema: {
              type: "object",
              properties: {
                suggestions: {
                  type: "array",
                  description: "Artigos relevantes, do mais para o menos relevante (máx 4)",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string", description: "id do artigo" },
                      reason: { type: "string", description: "por que ajuda neste caso, em uma frase" }
                    },
                    required: ["id", "reason"]
                  }
                },
                guidance: { type: "string", description: "Orientação curta ao analista de como resolver, com base nos artigos" }
              },
              required: ["suggestions", "guidance"]
            }
          }],
          tool_choice: { type: "tool", name: "suggest_articles" },
          system: "Você apoia analistas de atendimento. Dada a mensagem do cliente e a base de conhecimento, identifique pelos termos do que o cliente precisa e sugira os artigos relevantes (use os ids exatos) e uma orientação objetiva. Se nada for relevante, retorne suggestions vazio.",
          messages: [{ role: "user", content: `Mensagem do cliente:\n"${message}"\n\nBase de conhecimento:\n${catalog}` }]
        })
      });

      if (!response.ok) {
        this.logger.error("assistant_api_error", { status: response.status });
        return this._keywordFallback(message, base);
      }
      const data = await response.json();
      const block = data.content?.find((b) => b.type === "tool_use");
      if (!block) return this._keywordFallback(message, base);
      const byId = new Map(base.map((a) => [a.id, a]));
      const suggestions = (block.input.suggestions || [])
        .filter((s) => byId.has(s.id))
        .map((s) => ({ id: s.id, title: byId.get(s.id).title, reason: s.reason }));
      return { suggestions, guidance: block.input.guidance || "", source: "ai" };
    } catch (error) {
      this.logger.error("assistant_failed", { error: error.message });
      return this._keywordFallback(message, base);
    }
  }

  // Extrai o conteúdo textual de um documento (PDF) para indexar na base.
  // Usa o suporte nativo a PDF da Claude API. Retorna "" se não houver chave.
  async extractDocument({ base64, mime, name }) {
    if (!this.apiKey || mime !== "application/pdf") return "";
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": this.apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 2000,
          messages: [{
            role: "user",
            content: [
              { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
              { type: "text", text: `Extraia o conteúdo textual e os pontos-chave deste documento "${name}" para uma base de conhecimento de atendimento. Responda apenas com o texto/resumo objetivo, sem comentários.` }
            ]
          }]
        })
      });
      if (!response.ok) {
        this.logger.warn("extract_document_api_error", { status: response.status });
        return "";
      }
      const data = await response.json();
      return (data.content?.find((b) => b.type === "text")?.text || "").slice(0, 20000);
    } catch (error) {
      this.logger.warn("extract_document_failed", { error: error.message });
      return "";
    }
  }

  _keywordFallback(message, articles) {
    const stop = new Set(["para", "como", "the", "and", "que", "com", "uma", "dos", "das", "por", "meu", "minha", "está", "esta", "não", "sim"]);
    const terms = normalize(message).split(/\s+/).filter((w) => w.length > 3 && !stop.has(w));
    const scored = articles.map((a) => {
      const hay = normalize(`${a.title} ${a.category} ${(a.tags || []).join(" ")} ${a.content} ${a.attachmentsText || ""}`);
      let score = 0;
      for (const t of terms) if (hay.includes(t)) score++;
      return { a, score };
    }).filter((x) => x.score > 0).sort((x, y) => y.score - x.score).slice(0, 4);
    return {
      suggestions: scored.map((x) => ({ id: x.a.id, title: x.a.title, reason: "Corresponde aos termos da mensagem do cliente." })),
      guidance: scored.length ? "Sugestões por palavras-chave (IA desabilitada). Configure ANTHROPIC_API_KEY para análise completa." : "Nenhum artigo correspondeu aos termos da mensagem.",
      source: "keyword"
    };
  }
}

function normalize(value) {
  return String(value || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
