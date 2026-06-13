import fs from "node:fs";
import path from "node:path";

export class StateStore {
  constructor(filePath) {
    this.filePath = path.resolve(filePath);
    this.state = {
      version: 1,
      records: {}
    };
  }

  load() {
    if (!fs.existsSync(this.filePath)) return this.state;

    const content = fs.readFileSync(this.filePath, "utf8");
    if (!content.trim()) return this.state;

    const parsed = JSON.parse(content);
    this.state = {
      version: 1,
      records: {},
      ...parsed,
      records: parsed.records || {}
    };
    return this.state;
  }

  get(sourceKey) {
    return this.state.records[sourceKey] || null;
  }

  set(sourceKey, record) {
    this.state.records[sourceKey] = {
      ...record,
      updatedAt: new Date().toISOString()
    };
  }

  findSourceKeysByCrmOrderId(crmOrderId, exceptSourceKey) {
    return Object.entries(this.state.records)
      .filter(([sourceKey, record]) => sourceKey !== exceptSourceKey && String(record.crmOrderId || "") === String(crmOrderId || ""))
      .map(([sourceKey]) => sourceKey);
  }

  findSourceKeysByPhone(phone, exceptSourceKey) {
    return Object.entries(this.state.records)
      .filter(([sourceKey, record]) => sourceKey !== exceptSourceKey && String(record.phone || "") === String(phone || ""))
      .map(([sourceKey]) => sourceKey);
  }

  save() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tempFile = `${this.filePath}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(this.state, null, 2), "utf8");
    fs.renameSync(tempFile, this.filePath);
  }
}
