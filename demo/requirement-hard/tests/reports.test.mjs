import { test } from "node:test";
import assert from "node:assert/strict";

import { createEventLog } from "../src/events.mjs";
import { createInventory } from "../src/inventory.mjs";
import { createOrders } from "../src/orders.mjs";
import { createReports } from "../src/reports.mjs";

function setup() {
  const log = createEventLog();
  const inv = createInventory(log);
  const orders = createOrders(log, inv);
  const reports = createReports(log, inv, orders);
  return { log, inv, orders, reports };
}

test("R5 summary 汇总事件/订单/库存", () => {
  const { inv, orders, reports } = setup();
  inv.restock("apple", 10);
  inv.restock("pear", 5);
  const o1 = orders.placeOrder({ sku: "apple", qty: 2, key: "r1" });
  orders.placeOrder({ sku: "pear", qty: 1, key: "r2" });
  orders.cancelOrder(o1.id);

  const s = reports.summary();
  assert.equal(s.orders, 2);
  assert.equal(s.placed, 1);
  assert.equal(s.cancelled, 1);
  assert.equal(s.skus, 2);
  assert.equal(s.totalStock, 10 + 5 - 1);
  assert.ok(s.events > 0);
});

test("R5 summary 空系统全为 0", () => {
  const { reports } = setup();
  const s = reports.summary();
  assert.equal(s.orders, 0);
  assert.equal(s.placed, 0);
  assert.equal(s.cancelled, 0);
  assert.equal(s.skus, 0);
  assert.equal(s.totalStock, 0);
});

test("R5 auditTrail 与事件一一对应", () => {
  const { log, inv, reports } = setup();
  inv.restock("apple", 10);
  inv.reserve("apple", 1);

  const trail = reports.auditTrail();
  assert.equal(trail.length, log.size());
  assert.deepEqual(
    trail.map((t) => t.seq),
    [1, 2],
  );
  assert.equal(typeof trail[0].type, "string");
});
