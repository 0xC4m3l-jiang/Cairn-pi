import { test } from "node:test";
import assert from "node:assert/strict";

import { createEventLog } from "../src/events.mjs";
import { createInventory } from "../src/inventory.mjs";

test("R2 restock 增加库存并落事件", () => {
  const log = createEventLog();
  const inv = createInventory(log);
  inv.restock("apple", 10);
  assert.equal(inv.stock("apple"), 10);
  assert.equal(log.size(), 1);
});

test("R2 restock 非法 quantity 抛错", () => {
  const log = createEventLog();
  const inv = createInventory(log);
  assert.throws(() => inv.restock("apple", 0), /quantity/i);
  assert.throws(() => inv.restock("apple", -1), /quantity/i);
  assert.throws(() => inv.restock("apple", 1.5), /quantity/i);
});

test("R2 reserve 扣减库存并落事件", () => {
  const log = createEventLog();
  const inv = createInventory(log);
  inv.restock("apple", 10);
  inv.reserve("apple", 3);
  assert.equal(inv.stock("apple"), 7);
  assert.equal(log.size(), 2);
});

test("R2 reserve 库存不足抛错且库存不变", () => {
  const log = createEventLog();
  const inv = createInventory(log);
  inv.restock("apple", 2);
  assert.throws(() => inv.reserve("apple", 5), /stock/i);
  assert.equal(inv.stock("apple"), 2);
});

test("R2 release 归还库存", () => {
  const log = createEventLog();
  const inv = createInventory(log);
  inv.restock("apple", 10);
  inv.reserve("apple", 4);
  inv.release("apple", 4);
  assert.equal(inv.stock("apple"), 10);
});

test("R2 stock 未知 sku 返回 0；levels 返回副本", () => {
  const log = createEventLog();
  const inv = createInventory(log);
  assert.equal(inv.stock("nope"), 0);

  inv.restock("apple", 5);
  const levels = inv.levels();
  assert.equal(levels.apple, 5);
  levels.apple = 999;
  assert.equal(inv.stock("apple"), 5);
});
