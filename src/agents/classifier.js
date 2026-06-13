export class ClassifierAgent {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.apiKey = config.anthropicApiKey;
    this.model = config.classifierModel || "claude-haiku-4-5-20251001";
  }

  async classify({ contactName, firstMessage, conversationHistory = [] }) {
    if (!this.apiKey) {
      this.logger.warn("classifier_api_key_missing", { message: "Usando classificação padrão" });
      return this._defaultClassification(firstMessage);
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
          max_tokens: 500,
          tools: [
            {
              name: "save_classification",
              description: "Salva a classificação do ticket com categoria, prioridade e resumo",
              input_schema: {
                type: "object",
                properties: {
                  category: {
                    type: "string",
                    enum: ["support", "question", "complaint", "compliment", "sales", "other"],
                    description: "Categoria do ticket"
                  },
                  priority: {
                    type: "string",
                    enum: ["low", "medium", "high", "critical"],
                    description: "Nível de prioridade"
                  },
                  subject: {
                    type: "string",
                    description: "Resumo em até 60 caracteres"
                  },
                  reasoning: {
                    type: "string",
                    description: "Explicação breve da classificação"
                  },
                  confidence: {
                    type: "number",
                    description: "Confiança da classificação de 0 a 1"
                  }
                },
                required: ["category", "priority", "subject", "reasoning", "confidence"]
              }
            }
          ],
          tool_choice: { type: "tool", name: "save_classification" },
          messages: [
            {
              role: "user",
              content: this._buildPrompt(contactName, firstMessage, conversationHistory)
            }
          ],
          system: `Você é um classificador de tickets de atendimento ao cliente.
Analise a mensagem e classifique em:
- Categoria: suporte, pergunta, reclamação, elogio, vendas ou outro
- Prioridade: baixa, média, alta ou crítica
- Gere um subject descritivo em até 60 caracteres

Retorne SEMPRE usando a tool save_classification com os campos preenchidos.`
        })
      });

      if (!response.ok) {
        const error = await response.json();
        this.logger.error("classifier_api_error", {
          status: response.status,
          error: error.error?.message || error
        });
        return this._defaultClassification(firstMessage);
      }

      const data = await response.json();
      return this._parseToolResult(data);
    } catch (error) {
      this.logger.error("classifier_classification_failed", {
        error: error.message,
        contactName,
        firstMessagePreview: firstMessage.substring(0, 100)
      });
      return this._defaultClassification(firstMessage);
    }
  }

  _buildPrompt(contactName, firstMessage, conversationHistory) {
    let prompt = `Classifique esta primeira mensagem de atendimento.\n\n`;
    prompt += `Cliente: ${contactName}\n`;
    prompt += `Mensagem: ${firstMessage}\n`;

    if (conversationHistory && conversationHistory.length > 0) {
      prompt += `\nHistórico recente:\n`;
      conversationHistory.slice(-3).forEach((msg) => {
        prompt += `- ${msg.sender}: ${msg.text.substring(0, 100)}\n`;
      });
    }

    return prompt;
  }

  _parseToolResult(response) {
    try {
      const toolUseBlock = response.content?.find(block => block.type === "tool_use");
      if (!toolUseBlock) {
        this.logger.warn("classifier_no_tool_result", { response });
        return this._defaultClassification("");
      }

      const result = toolUseBlock.input;
      return {
        category: result.category || "support",
        priority: result.priority || "medium",
        subject: (result.subject || "").substring(0, 60),
        reasoning: result.reasoning || "",
        confidence: Math.min(1, Math.max(0, Number(result.confidence) || 0.5)),
        model: this.model,
        classifiedAt: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error("classifier_parse_error", { error: error.message });
      return this._defaultClassification("");
    }
  }

  _defaultClassification(message) {
    const shortMessage = (message || "").substring(0, 60);
    return {
      category: "support",
      priority: "medium",
      subject: shortMessage || "Novo ticket de atendimento",
      reasoning: "Classificação padrão (IA desabilitada ou erro na API)",
      confidence: 0,
      model: this.model,
      classifiedAt: new Date().toISOString()
    };
  }
}
