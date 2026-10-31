import { test } from "node:test";
import assert from "node:assert/strict";

import { createEventLog } from "../src/events.mjs";

test("R1 append 返回 seq 从 1 单调递增", () => {
  const log = createEventLog();
  const a = log.append("x", { v: 1 });
  const b = log.append("y", { v: 2 });
  assert.equal(a.seq, 1);
  assert.equal(b.seq, 2);
  assert.equal(a.type, "x");
  assert.equal(typeof a.at, "string");
  assert.ok(!Number.isNaN(Date.parse(a.at)));
});

test("R1 append 空 type 抛错", () => {
  const log = createEventLog();
  assert.throws(() => log.append("", {}), /type/i);
  assert.throws(() => log.append("   ", {}), /type/i);
});

test("R1 all() 返回浅拷贝，修改不影响日志", () => {
  const log = createEventLog();
  log.append("x", { v: 1 });
  const all = log.all();
  all[0].type = "hacked";
  all.push({ seq: 99 });
  assert.equal(log.size(), 1);
  assert.equal(log.all()[0].type, "x");
});

test("R1 byType 只返回该类型且按 seq 升序", () => {
  const log = createEventLog();
  log.append("a", {});
  log.append("b", {});
  log.append("a", {});
  const only = log.byType("a");
  assert.equal(only.length, 2);
  assert.deepEqual(
    only.map((e) => e.seq),
    [1, 3],
  );
});

test("R1 size 反映事件条数", () => {
  const log = createEventLog();
  assert.equal(log.size(), 0);
  log.append("a", {});
  log.append("b", {});
  assert.equal(log.size(), 2);
});
