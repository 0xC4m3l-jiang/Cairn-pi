import { test } from "node:test";
import assert from "node:assert/strict";

import { createEventLog } from "../src/events.mjs";
import { createInventory } from "../src/inventory.mjs";
import { createOrders } from "../src/orders.mjs";

function setup() {
  const log = createEventLog();
  const inv = createInventory(log);
  const orders = createOrders(log, inv);
  inv.restock("apple", 10);
  return { log, inv, orders };
}

test("R3 placeOrder 创建订单并扣库存", () => {
  const { inv, orders } = setup();
  const order = orders.placeOrder({ sku: "apple", qty: 3, key: "k1" });
  assert.equal(order.id, 1);
  assert.equal(order.status, "placed");
  assert.equal(order.sku, "apple");
  assert.equal(order.qty, 3);
  assert.equal(inv.stock("apple"), 7);
});

test("R3 placeOrder 库存不足抛错且库存不变", () => {
  const { inv, orders } = setup();
  assert.throws(() => orders.placeOrder({ sku: "apple", qty: 99, key: "k2" }), /stock/i);
  assert.equal(inv.stock("apple"), 10);
});

test("R3 placeOrder 非法 quantity 抛错", () => {
  const { orders } = setup();
  assert.throws(() => orders.placeOrder({ sku: "apple", qty: 0, key: "k3" }), /quantity/i);
});

test("R3 placeOrder 幂等：同 key 返回同订单且不重复扣库存/不新增事件", () => {
  const { log, inv, orders } = setup();
  const first = orders.placeOrder({ sku: "apple", qty: 2, key: "same" });
  const eventsAfterFirst = log.size();
  const stockAfterFirst = inv.stock("apple");

  const second = orders.placeOrder({ sku: "apple", qty: 2, key: "same" });
  assert.equal(second.id, first.id);
  assert.deepEqual(second, first);
  assert.equal(inv.stock("apple"), stockAfterFirst);
  assert.equal(log.size(), eventsAfterFirst);
});

test("R3 不同 key 生成新 id", () => {
  const { orders } = setup();
  const a = orders.placeOrder({ sku: "apple", qty: 1, key: "a" });
  const b = orders.placeOrder({ sku: "apple", qty: 1, key: "b" });
  assert.equal(a.id, 1);
  assert.equal(b.id, 2);
});

test("R3 cancelOrder 释放库存并置为 cancelled", () => {
  const { inv, orders } = setup();
  const order = orders.placeOrder({ sku: "apple", qty: 4, key: "c1" });
  const cancelled = orders.cancelOrder(order.id);
  assert.equal(cancelled.status, "cancelled");
  assert.equal(inv.stock("apple"), 10);
});

test("R3 cancelOrder 未知/重复取消抛错", () => {
  const { orders } = setup();
  assert.throws(() => orders.cancelOrder(999), /order/i);

  const order = orders.placeOrder({ sku: "apple", qty: 1, key: "c2" });
  orders.cancelOrder(order.id);
  assert.throws(() => orders.cancelOrder(order.id), /cancelled/i);
});

test("R3 getOrder / listOrders", () => {
  const { orders } = setup();
  const first = orders.placeOrder({ sku: "apple", qty: 1, key: "d1" });
  orders.placeOrder({ sku: "apple", qty: 1, key: "d2" });

  assert.equal(orders.getOrder(first.id).sku, "apple");
  assert.equal(orders.getOrder(999), undefined);

  const list = orders.listOrders();
  assert.equal(list.length, 2);
  list[0].status = "hacked";
  assert.equal(orders.getOrder(first.id).status, "placed");
});
