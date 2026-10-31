import { test } from "node:test";
import assert from "node:assert/strict";

import { createMembers } from "../src/members.mjs";

test("R2 addMember 返回带自增 id 与 active=true 的会员", () => {
  const members = createMembers();
  const m1 = members.addMember({ name: "Alice", email: "a@x.com" });
  const m2 = members.addMember({ name: "Bob", email: "b@x.com" });
  assert.equal(m1.id, 1);
  assert.equal(m2.id, 2);
  assert.equal(m1.active, true);
  assert.equal(m1.name, "Alice");
});

test("R2 addMember 空 name 抛错", () => {
  const members = createMembers();
  assert.throws(() => members.addMember({ name: "", email: "a@x.com" }), /name/i);
  assert.throws(() => members.addMember({ name: "   ", email: "a@x.com" }), /name/i);
});

test("R2 addMember 非法 email 抛错", () => {
  const members = createMembers();
  assert.throws(() => members.addMember({ name: "Alice", email: "no-at-sign" }), /email/i);
});

test("R2 getMember 返回会员或 undefined", () => {
  const members = createMembers();
  const m = members.addMember({ name: "Alice", email: "a@x.com" });
  assert.equal(members.getMember(m.id).name, "Alice");
  assert.equal(members.getMember(999), undefined);
});
