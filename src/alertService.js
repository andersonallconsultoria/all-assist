export class AlertService {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
  }

  isConfigured() {
    return Boolean(this.config.alerts?.telegramBotToken && this.config.alerts?.telegramChatId);
  }

  async notify({ title = "ALL Assist", message = "", metadata = {} }) {
    return this.notifyError({ title, message, metadata });
  }

  async notifyError({ title = "Erro no ALL Assist", message = "", metadata = {} }) {
    if (!this.isConfigured()) return false;

    const text = formatTelegramMessage({ title, message, metadata });
    const url = `https://api.telegram.org/bot${this.config.alerts.telegramBotToken}/sendMessage`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          chat_id: this.config.alerts.telegramChatId,
          text,
          parse_mode: "HTML",
          disable_web_page_preview: true
        })
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Telegram respondeu ${response.status}: ${body.slice(0, 200)}`);
      }

      return true;
    } catch (error) {
      this.logger.warn("telegram_alert_failed", {
        error: error.message
      });
      return false;
    }
  }
}

function formatTelegramMessage({ title, message, metadata }) {
  const rows = Object.entries(metadata || {})
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .slice(0, 12)
    .map(([key, value]) => `<b>${escapeHtml(key)}:</b> ${escapeHtml(String(value))}`)
    .join("\n");

  return [
    `ALERTA <b>${escapeHtml(title)}</b>`,
    message ? escapeHtml(message) : "",
    rows
  ].filter(Boolean).join("\n\n");
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
