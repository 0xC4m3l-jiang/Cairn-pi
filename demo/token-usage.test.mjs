import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { formatRow, mergeSummaries, parseSessionText, summarizeSessionDir } from "./token-usage.mjs";

function line(id, role, usage, model = "m1") {
  return JSON.stringify({ type: "message", id, message: { role, model, usage } });
}

const U1 = { input: 100, output: 10, cacheRead: 5, cacheWrite: 0, reasoning: 2, totalTokens: 117, cost: { total: 0.01 } };
const U2 = { input: 200, output: 20, cacheRead: 7, cacheWrite: 1, reasoning: 3, totalTokens: 231, cost: { total: 0.02 } };

test("累加 assistant 消息的用量与成本", () => {
  const text = [line("a", "assistant", U1), line("b", "assistant", U2)].join("\n");
  const result = parseSessionText(text);
  assert.equal(result.assistantMessages, 2);
  assert.equal(result.usage.input, 300);
  assert.equal(result.usage.output, 30);
  assert.equal(result.usage.cacheRead, 12);
  assert.equal(result.usage.totalTokens, 348);
  assert.ok(Math.abs(result.usage.cost - 0.03) < 1e-9);
});

test("忽略非 assistant 与没有 usage 的消息", () => {
  const text = [
    JSON.stringify({ type: "message", id: "s", message: { role: "system", content: "x" } }),
    JSON.stringify({ type: "message", id: "u", message: { role: "user", content: "y" } }),
    line("a", "assistant", U1),
    JSON.stringify({ type: "message", id: "a2", message: { role: "assistant", content: "无用量" } }),
  ].join("\n");
  const result = parseSessionText(text);
  assert.equal(result.assistantMessages, 1);
  assert.equal(result.usage.input, 100);
});

test("同一消息 id 只计一次（去重）", () => {
  const text = [line("dup", "assistant", U1), line("dup", "assistant", U1)].join("\n");
  const result = parseSessionText(text);
  assert.equal(result.assistantMessages, 1);
  assert.equal(result.usage.input, 100);
});

test("坏行计入 malformed 且不中断解析", () => {
  const text = ["{不是 json", line("a", "assistant", U1), ""].join("\n");
  const result = parseSessionText(text);
  assert.equal(result.malformed, 1);
  assert.equal(result.usage.input, 100);
});

test("缺失或非法数字按 0 处理，不产生 NaN", () => {
  const text = line("a", "assistant", { input: "oops", output: null, totalTokens: undefined });
  const result = parseSessionText(text);
  assert.equal(result.usage.input, 0);
  assert.equal(result.usage.output, 0);
  assert.equal(result.usage.totalTokens, 0);
  assert.equal(result.usage.cost, 0);
  assert.ok(Number.isFinite(result.usage.input));
});

test("按模型分组累计", () => {
  const text = [line("a", "assistant", U1, "model-x"), line("b", "assistant", U2, "model-y")].join("\n");
  const result = parseSessionText(text);
  assert.deepEqual(Object.keys(result.byModel).sort(), ["model-x", "model-y"]);
  assert.equal(result.byModel["model-x"].input, 100);
  assert.equal(result.byModel["model-y"].input, 200);
});

test("mergeSummaries 合并多文件", () => {
  const a = parseSessionText(line("a", "assistant", U1));
  const b = parseSessionText(line("b", "assistant", U2));
  const merged = mergeSummaries([a, b]);
  assert.equal(merged.assistantMessages, 2);
  assert.equal(merged.usage.input, 300);
});

test("summarizeSessionDir 递归读取 jsonl 并跳过其它文件", async () => {
  const dir = mkdtempSync(join(tmpdir(), "cairn-usage-"));
  try {
    writeFileSync(join(dir, "one.jsonl"), `${line("a", "assistant", U1)}\n`);
    mkdirSync(join(dir, "nested"));
    writeFileSync(join(dir, "nested", "two.jsonl"), `${line("b", "assistant", U2)}\n`);
    writeFileSync(join(dir, "ignore.txt"), "not a session");

    const summary = await summarizeSessionDir(dir);
    assert.equal(summary.files, 2);
    assert.equal(summary.assistantMessages, 2);
    assert.equal(summary.usage.input, 300);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("目录不存在时返回零值而不抛错", async () => {
  const summary = await summarizeSessionDir(join(tmpdir(), "cairn-does-not-exist-xyz"));
  assert.equal(summary.files, 0);
  assert.equal(summary.usage.input, 0);
});

test("formatRow 产出固定列宽的一行", () => {
  const row = formatRow("A", parseSessionText(line("a", "assistant", U1)));
  assert.match(row, /^A\s+\d+\s+\d+\s+\d+\s+\d+\s+[\d.]+$/);
});

test("mergeSummaries 保留成本（回归：计数器二次累加曾把 cost 归零）", () => {
  const a = parseSessionText([line("a", "assistant", U1), line("b", "assistant", U2)].join("\n"));
  const b = parseSessionText(line("c", "assistant", U1));
  const merged = mergeSummaries([a, b]);
  assert.ok(Math.abs(merged.usage.cost - 0.04) < 1e-9, `期望 0.04，实得 ${merged.usage.cost}`);
  assert.ok(Math.abs(merged.byModel.m1.cost - 0.04) < 1e-9);
});

test("summarizeSessionDir 的 cost 不为 0", async () => {
  const dir = mkdtempSync(join(tmpdir(), "cairn-cost-"));
  try {
    writeFileSync(join(dir, "one.jsonl"), `${line("a", "assistant", U1)}\n`);
    const summary = await summarizeSessionDir(dir);
    assert.ok(summary.usage.cost > 0, `cost 应为正数，实得 ${summary.usage.cost}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
