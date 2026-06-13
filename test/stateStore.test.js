import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { StateStore } from "../src/stateStore.js";

test("StateStore persists records", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ciss-dkw-state-"));
  const file = path.join(dir, "state.json");

  const store = new StateStore(file);
  store.load();
  store.set("1:98438", {
    hash: "abc",
    crmOrderId: 123
  });
  store.save();

  const reloaded = new StateStore(file);
  reloaded.load();

  assert.equal(reloaded.get("1:98438").hash, "abc");
  assert.deepEqual(reloaded.findSourceKeysByCrmOrderId(123, "x"), ["1:98438"]);
});
