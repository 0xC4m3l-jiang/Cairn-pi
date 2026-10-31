import { test } from "node:test";
import assert from "node:assert/strict";

import { createEventLog } from "../src/events.mjs";
import { createSnapshots } from "../src/snapshots.mjs";

test("R4 capture 返回当前事件条数", () => {
  const log = createEventLog();
  const snap = createSnapshots(log);
  log.append("a", {});
  log.append("b", {});
  const marker = snap.capture();
  assert.equal(marker.seq, 2);
  assert.equal(typeof marker.at, "string");
});

test("R4 since 只返回 seq 之后的事件", () => {
  const log = createEventLog();
  const snap = createSnapshots(log);
  log.append("a", {});
  log.append("b", {});
  const marker = snap.capture();
  log.append("c", {});

  const delta = snap.since(marker.seq);
  assert.deepEqual(
    delta.map((e) => e.type),
    ["c"],
  );

  delta[0].type = "hacked";
  assert.equal(log.all()[2].type, "c");
});

test("R4 rebuild 用 reducer 累加全部事件", () => {
  const log = createEventLog();
  const snap = createSnapshots(log);
  log.append("add", { n: 1 });
  log.append("add", { n: 2 });
  log.append("add", { n: 3 });

  const total = snap.rebuild((acc, event) => acc + event.payload.n, 0);
  assert.equal(total, 6);
});
