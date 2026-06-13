import crypto from "node:crypto";

// Gera um sufixo aleatório curto para compor IDs de entidades (ex: tk_<randomId>).
export function randomId() {
  return `${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;
}
