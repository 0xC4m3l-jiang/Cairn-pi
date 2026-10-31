import { test } from "node:test";
import assert from "node:assert/strict";

import { createBooks } from "../src/books.mjs";
import { createMembers } from "../src/members.mjs";
import { createLoans } from "../src/loans.mjs";
import { createReports } from "../src/reports.mjs";

test("R4 report 汇总图书/会员/借阅统计", () => {
  const books = createBooks();
  const members = createMembers();
  const loans = createLoans(books, members);
  const reports = createReports(books, members, loans);

  const b1 = books.addBook({ title: "A", author: "X", isbn: "1234567890" });
  books.addBook({ title: "B", author: "Y", isbn: "1234567890123" });
  const m1 = members.addMember({ name: "Alice", email: "a@x.com" });
  members.addMember({ name: "Bob", email: "b@x.com" });

  const loan = loans.borrow(m1.id, b1.id);

  const r = reports.report();
  assert.equal(r.totalBooks, 2);
  assert.equal(r.availableBooks, 1);
  assert.equal(r.totalMembers, 2);
  assert.equal(r.totalLoans, 1);
  assert.equal(r.activeLoans, 1);

  loans.returnBook(loan.id);
  const r2 = reports.report();
  assert.equal(r2.availableBooks, 2);
  assert.equal(r2.activeLoans, 0);
});
