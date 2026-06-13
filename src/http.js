import { setTimeout as delay } from "node:timers/promises";

export class HttpError extends Error {
  constructor(message, { status, body, url, method }) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.body = body;
    this.url = url;
    this.method = method;
  }
}

export async function requestJson(url, options = {}, httpConfig = {}) {
  const {
    timeoutMs = 30_000,
    retries = 2,
    retryDelayMs = 1000
  } = httpConfig;

  const method = options.method || "GET";
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });

      const text = await response.text();
      const body = parseBody(text);

      if (!response.ok) {
        throw new HttpError(`HTTP ${response.status} on ${method} ${url}`, {
          status: response.status,
          body,
          url,
          method
        });
      }

      return body;
    } catch (error) {
      lastError = error;
      const canRetry = attempt < retries && shouldRetry(error);
      if (!canRetry) throw error;
      await delay(retryDelayMs * (attempt + 1));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError;
}

function parseBody(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function shouldRetry(error) {
  if (error.name === "AbortError") return true;
  if (!(error instanceof HttpError)) return true;
  return error.status >= 500 || error.status === 429;
}
