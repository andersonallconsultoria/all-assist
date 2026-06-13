import fs from "node:fs";
import path from "node:path";

const LEVELS = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

const SENSITIVE_KEYS = new Set([
  "authorization",
  "api-key",
  "apiKey",
  "password",
  "clientSecret",
  "client_secret",
  "access_token",
  "token"
]);

export function createLogger({ level = "info", file = "" } = {}) {
  const minimum = LEVELS[level] || LEVELS.info;
  const filePath = file ? path.resolve(file) : "";
  if (filePath) fs.mkdirSync(path.dirname(filePath), { recursive: true });

  function write(levelName, event, data = {}) {
    if ((LEVELS[levelName] || LEVELS.info) < minimum) return;

    const payload = {
      ts: new Date().toISOString(),
      level: levelName,
      event,
      ...redact(data)
    };

    const line = JSON.stringify(payload);
    if (levelName === "error") console.error(line);
    else console.log(line);

    if (filePath) fs.appendFileSync(filePath, `${line}\n`, "utf8");
  }

  return {
    debug: (event, data) => write("debug", event, data),
    info: (event, data) => write("info", event, data),
    warn: (event, data) => write("warn", event, data),
    error: (event, data) => write("error", event, data)
  };
}

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== "object") return value;

  const result = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    result[key] = SENSITIVE_KEYS.has(key) ? "[REDACTED]" : redact(nestedValue);
  }
  return result;
}
