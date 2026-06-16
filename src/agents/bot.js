// Bot de atendimento inicial: recebe a primeira mensagem do cliente, tenta
// responder com base na base de conhecimento e decide encaminhar para um
// analista humano. Funciona sem ANTHROPIC_API_KEY (apenas saúda e encaminha).
export class BotAgent {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.apiKey = config.anthropicApiKey;
    this.model = config.classifierModel || "claude-haiku-4-5-20251001";
  }

  async reply({ message, contactName = "", botConfig = {}, articles = [] }) {
    const greeting = botConfig.greeting || "Olá! Sou o assistente virtual de atendimento. Como posso ajudar?";
    const handoffMessage = botConfig.handoffMessage || "Vou encaminhar você para um de nossos analistas. Um momento, por favor.";

    if (!this.apiKey) {
      // Sem IA: saúda e encaminha para o humano.
      return { reply: greeting, handoff: true, source: "no-ai" };
    }

    try {
      const kb = (articles || []).filter((a) => a && a.title).map((a, i) =>
        `[${i}] ${a.title}${a.category ? ` (${a.category})` : ""}\n${(a.content || "").slice(0, 700)}${a.attachmentsText ? `\nAnexos: ${a.attachmentsText.slice(0, 400)}` : ""}`
      ).join("\n\n") || "(base de conhecimento vazia)";

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": this.apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 600,
          tools: [{
            name: "responder",
            description: "Responde ao cliente e indica se deve encaminhar para um analista humano",
            input_schema: {
              type: "object",
              properties: {
                reply: { type: "string", description: "Resposta cordial e objetiva ao cliente" },
                handoff: { type: "boolean", description: "true se precisa encaminhar para um humano (não soube resolver, assunto sensível, ou o cliente pediu)" }
              },
              required: ["reply", "handoff"]
            }
          }],
          tool_choice: { type: "tool", name: "responder" },
          system: `Você é o assistente virtual de atendimento${botConfig.companyName ? ` da ${botConfig.companyName}` : ""}. Atenda de forma cordial, objetiva e em português. Use a base de conhecimento abaixo para responder. Se não houver informação suficiente, se for assunto sensível, ou se o cliente pedir, defina handoff=true e avise que vai encaminhar para um analista. Nunca invente dados.\n\nBASE DE CONHECIMENTO:\n${kb}`,
          messages: [{ role: "user", content: `Cliente: ${contactName || "—"}\nMensagem: ${message}` }]
        })
      });

      if (!response.ok) {
        this.logger.warn("bot_api_error", { status: response.status });
        return { reply: greeting, handoff: true, source: "error" };
      }
      const data = await response.json();
      const block = data.content?.find((b) => b.type === "tool_use");
      if (!block) return { reply: greeting, handoff: true, source: "no-tool" };
      let reply = String(block.input.reply || greeting);
      const handoff = Boolean(block.input.handoff);
      if (handoff && !reply.includes("analista")) reply += `\n\n${handoffMessage}`;
      return { reply, handoff, source: "ai" };
    } catch (error) {
      this.logger.warn("bot_failed", { error: error.message });
      return { reply: greeting, handoff: true, source: "error" };
    }
  }
}
