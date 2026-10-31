import { test } from "node:test";
import assert from "node:assert/strict";

import { createTodo } from "../src/todo.mjs";

test("R1 add 返回带自增 id 的条目", () => {
  const todo = createTodo();
  const first = todo.add("first");
  const second = todo.add("second");
  assert.equal(first.id, 1);
  assert.equal(second.id, 2);
  assert.equal(first.done, false);
  assert.equal(first.title, "first");
});

test("R1 add 空标题抛错", () => {
  const todo = createTodo();
  assert.throws(() => todo.add(""), /title/i);
  assert.throws(() => todo.add("   "), /title/i);
});

test("R2 toggle 翻转完成状态并返回条目", () => {
  const todo = createTodo();
  const item = todo.add("x");
  const flipped = todo.toggle(item.id);
  assert.equal(flipped.done, true);
  assert.equal(todo.list()[0].done, true);
  assert.equal(todo.toggle(item.id).done, false);
});

test("R2 toggle 未知 id 抛错", () => {
  const todo = createTodo();
  assert.throws(() => todo.toggle(99), /not found|unknown/i);
});

test("R3 list 按创建顺序返回且为浅拷贝", () => {
  const todo = createTodo();
  todo.add("a");
  todo.add("b");
  todo.add("c");
  assert.deepEqual(
    todo.list().map((item) => item.title),
    ["a", "b", "c"],
  );
  const snapshot = todo.list();
  snapshot[0].title = "hacked";
  assert.equal(todo.list()[0].title, "a");
});

test("R3 summary 统计完成数", () => {
  const todo = createTodo();
  todo.add("a");
  const second = todo.add("b");
  todo.add("c");
  assert.equal(todo.summary(), "0/3 done");
  todo.toggle(second.id);
  assert.equal(todo.summary(), "1/3 done");
});
