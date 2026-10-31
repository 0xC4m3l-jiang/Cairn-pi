/**
 * 隐藏探针：不给 A/B 两组看。
 * 全部条目都严格由 REQ.md 推出，但给定测试没有覆盖——用来测「实现是否真的理解了规格」。
 * 用法：把本文件放到被测项目的 probes/ 下（它 import ../src/*.mjs）。
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { createEventLog } from "../src/events.mjs";
import { createInventory } from "../src/inventory.mjs";
import { createOrders } from "../src/orders.mjs";
import { createSnapshots } from "../src/snapshots.mjs";
import { createReports } from "../src/reports.mjs";

function setup() {
  const log = createEventLog();
  const inv = createInventory(log);
  const orders = createOrders(log, inv);
  const reports = createReports(log, inv, orders);
  const snapshots = createSnapshots(log);
  return { log, inv, orders, reports, snapshots };
}

test("P1 byType 同样返回浅拷贝（R1「同上」）", () => {
  const { log } = setup();
  log.append("a", { v: 1 });
  const hits = log.byType("a");
  hits[0].type = "hacked";
  assert.equal(log.byType("a")[0].type, "a");
});

test("P2 release 非法 quantity 抛错含 quantity（R2）", () => {
  const { inv } = setup();
  assert.throws(() => inv.release("apple", 0), /quantity/i);
  assert.throws(() => inv.release("apple", -3), /quantity/i);
});

test("P3 reserve 未知 sku 抛错含 stock（R2）", () => {
  const { inv } = setup();
  assert.throws(() => inv.reserve("never-restocked", 1), /stock/i);
});

test("P4 多个 sku 状态互不影响（R2）", () => {
  const { inv } = setup();
  inv.restock("apple", 10);
  inv.restock("pear", 3);
  inv.reserve("apple", 7);
  assert.equal(inv.stock("apple"), 3);
  assert.equal(inv.stock("pear"), 3);
});

test("P5 未 restock 的 sku：stock 为 0 且不出现在 levels（R2）", () => {
  const { inv } = setup();
  assert.equal(inv.stock("ghost"), 0);
  assert.equal(Object.hasOwn(inv.levels(), "ghost"), false);
});

test("P6 订单 id 不复用：取消后新单 id 继续递增（R3）", () => {
  const { inv, orders } = setup();
  inv.restock("apple", 10);
  const first = orders.placeOrder({ sku: "apple", qty: 1, key: "a" });
  orders.cancelOrder(first.id);
  const second = orders.placeOrder({ sku: "apple", qty: 1, key: "b" });
  assert.equal(second.id, 2);
});

test("P7 summary.events 等于事件条数（R5）", () => {
  const { log, inv, reports } = setup();
  inv.restock("apple", 1);
  inv.restock("pear", 1);
  assert.equal(reports.summary().events, log.size());
});

test("P8 since(0) 返回全部事件（R4）", () => {
  const { log, snapshots } = setup();
  log.append("a", {});
  log.append("b", {});
  assert.equal(snapshots.since(0).length, 2);
});

test("P9 rebuild 不修改 initial，且可重复调用（R4）", () => {
  const { log, snapshots } = setup();
  log.append("add", { n: 2 });
  log.append("add", { n: 3 });
  const initial = { total: 0 };
  const result = snapshots.rebuild((acc, event) => ({ total: acc.total + event.payload.n }), initial);
  assert.equal(result.total, 5);
  assert.equal(initial.total, 0, "initial 不应被修改");
  assert.equal(snapshots.rebuild((acc, event) => ({ total: acc.total + event.payload.n }), initial).total, 5);
});

test("P10 placeOrder 失败不留脏状态：库存/订单/事件均不变（R3 原子性）", () => {
  const { log, inv, orders } = setup();
  inv.restock("apple", 2);
  const eventsBefore = log.size();
  const ordersBefore = orders.listOrders().length;

  assert.throws(() => orders.placeOrder({ sku: "apple", qty: 99, key: "boom" }), /stock/i);

  assert.equal(inv.stock("apple"), 2);
  assert.equal(orders.listOrders().length, ordersBefore);
  assert.equal(log.size(), eventsBefore);
});

test("P11 未知 sku 必须返回数字 0，含原型链上的键（R2）", () => {
  const { inv } = setup();
  // 普通对象存储会把 "toString"/"constructor" 命中原型链，返回函数而不是 0
  for (const sku of ["nope", "toString", "constructor", "hasOwnProperty", "__proto__"]) {
    const value = inv.stock(sku);
    assert.equal(typeof value, "number", `stock("${sku}") 应返回数字，实得 ${typeof value}`);
    assert.equal(value, 0, `stock("${sku}") 应为 0，实得 ${String(value)}`);
  }
});


test("P12 合法 sku 名为 __proto__ 时，levels() 与 summary() 必须如实反映（R2/R5）", () => {
  const { inv, reports } = setup();
  inv.restock("__proto__", 5);
  assert.equal(inv.stock("__proto__"), 5);

  const levels = inv.levels();
  assert.equal(Object.prototype.hasOwnProperty.call(levels, "__proto__"), true, "levels() 丢失了 __proto__ 键");
  assert.equal(levels["__proto__"], 5);

  assert.equal(reports.summary().totalStock, 5);
});
