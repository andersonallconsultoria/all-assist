import fs from "node:fs";
import path from "node:path";

// Armazenamento simples de arquivos em disco (anexos da base de conhecimento,
// e futuramente mídia do chat). No Docker, o diretório fica no volume ./data.
export class FileStore {
  constructor(dir) {
    this.dir = path.resolve(dir);
    fs.mkdirSync(this.dir, { recursive: true });
  }

  save(id, buffer) {
    fs.writeFileSync(path.join(this.dir, id), buffer);
    return id;
  }

  read(id) {
    const p = path.join(this.dir, this._safe(id));
    return fs.existsSync(p) ? fs.readFileSync(p) : null;
  }

  remove(id) {
    const p = path.join(this.dir, this._safe(id));
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }

  // Evita path traversal (id deve ser um nome simples).
  _safe(id) {
    return String(id).replace(/[^a-zA-Z0-9_.-]/g, "");
  }
}
