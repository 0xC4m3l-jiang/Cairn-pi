import { test } from "node:test";
import assert from "node:assert/strict";

import { createBooks } from "../src/books.mjs";

test("R1 addBook 返回带自增 id 与 available=true 的图书", () => {
  const books = createBooks();
  const b1 = books.addBook({ title: "A", author: "X", isbn: "1234567890" });
  const b2 = books.addBook({ title: "B", author: "Y", isbn: "1234567890123" });
  assert.equal(b1.id, 1);
  assert.equal(b2.id, 2);
  assert.equal(b1.available, true);
  assert.equal(b1.title, "A");
});

test("R1 addBook 空标题/空作者抛错", () => {
  const books = createBooks();
  assert.throws(() => books.addBook({ title: "", author: "X", isbn: "1234567890" }), /title/i);
  assert.throws(() => books.addBook({ title: "   ", author: "X", isbn: "1234567890" }), /title/i);
  assert.throws(() => books.addBook({ title: "A", author: " ", isbn: "1234567890" }), /author/i);
});

test("R1 addBook 非法 isbn 抛错", () => {
  const books = createBooks();
  assert.throws(() => books.addBook({ title: "A", author: "X", isbn: "123" }), /isbn/i);
  assert.throws(() => books.addBook({ title: "A", author: "X", isbn: "abc1234567" }), /isbn/i);
});

test("R1 getBook 返回图书或 undefined", () => {
  const books = createBooks();
  const b = books.addBook({ title: "A", author: "X", isbn: "1234567890" });
  assert.equal(books.getBook(b.id).title, "A");
  assert.equal(books.getBook(999), undefined);
});

test("R1 listBooks 按顺序返回浅拷贝", () => {
  const books = createBooks();
  books.addBook({ title: "A", author: "X", isbn: "1234567890" });
  books.addBook({ title: "B", author: "Y", isbn: "1234567890123" });
  assert.deepEqual(
    books.listBooks().map((b) => b.title),
    ["A", "B"],
  );
  const snapshot = books.listBooks();
  snapshot[0].title = "hacked";
  assert.equal(books.listBooks()[0].title, "A");
});
