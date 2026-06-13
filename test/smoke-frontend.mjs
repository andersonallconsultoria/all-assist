// Smoke test do app.js: carrega o script num DOM falso onde getElementById
// retorna null para IDs ausentes no index.html — pega listeners top-level
// que apontam para elementos removidos (TypeError no boot).
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const pub = path.join(dir, "..", "public");
const html = fs.readFileSync(path.join(pub, "index.html"), "utf8");
const appJs = fs.readFileSync(path.join(pub, "app.js"), "utf8");

const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));

const makeEl = () => {
  const el = {
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    style: {},
    dataset: {},
    addEventListener() {},
    removeEventListener() {},
    appendChild() {},
    setAttribute() {},
    getAttribute: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    closest: () => makeEl(),
    focus() {},
    click() {},
    remove() {},
    insertAdjacentHTML() {},
    scrollIntoView() {},
    textContent: "",
    innerHTML: "",
    value: "",
    checked: false,
    hidden: false,
    children: [],
    parentElement: null
  };
  return el;
};

const doc = {
  getElementById: (id) => (ids.has(id) ? makeEl() : null),
  querySelector: () => makeEl(),
  querySelectorAll: () => [],
  createElement: () => makeEl(),
  addEventListener() {},
  body: makeEl(),
  documentElement: makeEl()
};

const sandbox = {
  document: doc,
  window: { addEventListener() {}, location: { href: "", pathname: "/", hash: "" }, matchMedia: () => ({ matches: false, addEventListener() {} }) },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  navigator: { onLine: true, clipboard: { writeText: async () => {} } },
  console,
  setTimeout: () => 0,
  clearTimeout() {},
  setInterval: () => 0,
  clearInterval() {},
  fetch: async () => ({ ok: true, status: 200, json: async () => ({ data: [], user: {}, context: {} }) }),
  URLSearchParams,
  Intl,
  Date,
  Math,
  JSON
};
sandbox.window.document = doc;
sandbox.globalThis = sandbox;

let failed = false;
const rejections = [];
process.on("unhandledRejection", (err) => rejections.push(err));

try {
  vm.runInNewContext(appJs, sandbox, { filename: "app.js", timeout: 5000 });
  console.log("✓ app.js carregou no DOM falso sem erro de runtime no top-level");
} catch (error) {
  failed = true;
  console.error("✗ ERRO ao carregar app.js:", error.message);
  console.error(error.stack?.split("\n").slice(0, 4).join("\n"));
}

// Dá tempo para loadAll() (async, fetch mockado) e os render*() do boot rodarem.
await new Promise((resolve) => { let i = 0; const tick = () => (i++ < 50 ? Promise.resolve().then(tick) : resolve()); tick(); });

// Erros do tipo "Cannot read properties of null" indicam acesso a DOM removido.
const domErrors = rejections.filter((e) => /null|undefined/.test(e?.message || ""));
if (domErrors.length) {
  failed = true;
  console.error(`✗ ${domErrors.length} erro(s) de DOM nas funções de boot:`);
  domErrors.slice(0, 5).forEach((e) => console.error("  -", e.message));
} else {
  console.log("✓ funções de render do boot rodaram sem tocar DOM removido");
}

process.exit(failed ? 1 : 0);
