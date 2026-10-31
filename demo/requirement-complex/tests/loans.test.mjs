import { test } from "node:test";
import assert from "node:assert/strict";

import { createBooks } from "../src/books.mjs";
import { createMembers } from "../src/members.mjs";
import { createLoans } from "../src/loans.mjs";

function setup() {
  const books = createBooks();
  const members = createMembers();
  const book = books.addBook({ title: "A", author: "X", isbn: "1234567890" });
  const member = members.addMember({ name: "Alice", email: "a@x.com" });
  const loans = createLoans(books, members);
  return { books, book, member, loans };
}

test("R3 borrow 返回借阅并把书置为不可借", () => {
  const { books, book, member, loans } = setup();
  const loan = loans.borrow(member.id, book.id);
  assert.equal(loan.memberId, member.id);
  assert.equal(loan.bookId, book.id);
  assert.equal(loan.returnedAt, null);
  assert.equal(typeof loan.dueAt, "number");
  assert.ok(loan.dueAt > Date.now());

  assert.equal(books.getBook(book.id).available, false);
});

test("R3 borrow 会员/图书不存在或已借出抛错", () => {
  const { book, member, loans } = setup();
  assert.throws(() => loans.borrow(999, book.id), /member/i);
  assert.throws(() => loans.borrow(member.id, 999), /book/i);

  loans.borrow(member.id, book.id);
  assert.throws(() => loans.borrow(member.id, book.id), /available/i);
});

test("R3 returnBook 归还并恢复可借状态", () => {
  const { books, book, member, loans } = setup();
  const loan = loans.borrow(member.id, book.id);
  const returned = loans.returnBook(loan.id);
  assert.equal(typeof returned.returnedAt, "number");

  assert.equal(books.getBook(book.id).available, true);
});

test("R3 returnBook 未知/已归还抛错", () => {
  const { book, member, loans } = setup();
  assert.throws(() => loans.returnBook(999), /loan/i);

  const loan = loans.borrow(member.id, book.id);
  loans.returnBook(loan.id);
  assert.throws(() => loans.returnBook(loan.id), /returned/i);
});

test("R3 listLoans 按借出顺序返回浅拷贝", () => {
  const books = createBooks();
  const members = createMembers();
  const loans = createLoans(books, members);
  const bookA = books.addBook({ title: "A", author: "X", isbn: "1234567890" });
  const bookB = books.addBook({ title: "B", author: "Y", isbn: "1234567890123" });
  const member = members.addMember({ name: "Alice", email: "a@x.com" });
  const l1 = loans.borrow(member.id, bookA.id);
  const l2 = loans.borrow(member.id, bookB.id);
  assert.deepEqual(
    loans.listLoans().map((l) => l.id),
    [l1.id, l2.id],
  );
});
