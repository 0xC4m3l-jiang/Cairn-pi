import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { recheckModule, renderLevelCommand, runCommand, runLevels, validateEvidence } from "../lib/verify";
import { evidence, makeConfig, makeNode } from "./fixtures";

const cfg = makeConfig();
const dir = mkdtempSync(join(tmpdir(), "cairn-verify-"));

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("renderLevelCommand", () => {
  it("替换 {tests} 与 {module}", () => {
    const node = makeNode({ id: "n01", module: "auth", tests: ["a.test.ts", "b.test.ts"] });
    expect(renderLevelCommand({ id: "unit", required: true, how: "run {tests} in {module}", scope: "node" }, node)).toBe(
      "run a.test.ts b.test.ts in auth",
    );
  });
});

describe("runCommand", () => {
  it("成功命令 exit=0 并有输出片段", async () => {
    const result = await runCommand({ cwd: dir, cmd: "echo hello-cairn" });
    expect(result.exit).toBe(0);
    expect(result.excerpt).toContain("hello-cairn");
    expect(result.cmd).toBe("echo hello-cairn");
  });

  it("失败命令带出真实退出码（不信自报）", async () => {
    const result = await runCommand({ cwd: dir, cmd: "exit 3" });
    expect(result.exit).toBe(3);
  });

  it("超时记为 124", async () => {
    const result = await runCommand({ cwd: dir, cmd: "sleep 5", timeoutMs: 200 });
    expect(result.exit).toBe(124);
  });
});

describe("validateEvidence（复核第 1、2 层）", () => {
  const expected = { unit: "true a.test.ts", acceptance: "true a.test.ts" };

  it("齐全时通过", () => {
    expect(
      validateEvidence({
        levels: { unit: evidence("true a.test.ts", 0), acceptance: evidence("true a.test.ts", 0) },
        cfg,
        expected,
        scope: "node",
      }),
    ).toEqual({ ok: true });
  });

  it("命令与配置不一致时拒绝", () => {
    const result = validateEvidence({
      levels: { unit: evidence("npm run fake", 0), acceptance: evidence("true a.test.ts", 0) },
      cfg,
      expected,
      scope: "node",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("命令不一致");
  });

  it("缺级别时拒绝", () => {
    const result = validateEvidence({
      levels: { unit: evidence("true a.test.ts", 0) },
      cfg,
      expected,
      scope: "node",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("缺 acceptance");
  });

  it("退出码非整数时拒绝", () => {
    const bad = { cmd: "true a.test.ts", exit: 0.5, excerpt: "ok" };
    const result = validateEvidence({
      levels: { unit: bad, acceptance: evidence("true a.test.ts", 0) },
      cfg,
      expected,
      scope: "node",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("不是整数");
  });

  it("片段为空时拒绝", () => {
    const result = validateEvidence({
      levels: { unit: evidence("true a.test.ts", 0, " "), acceptance: evidence("true a.test.ts", 0) },
      cfg,
      expected,
      scope: "node",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("excerpt 为空");
  });
});

describe("runLevels", () => {
  it("缺测试时该级判失败，不放行", async () => {
    const node = makeNode({ id: "n01", tests: [] });
    const result = await runLevels({ cwd: dir, node, cfg, scope: "node" });
    expect(result.verdict).toBe("fail");
    expect(result.skipped).toEqual(["unit", "acceptance"]);
    expect(result.levels).toEqual({});
  });

  it("命令全绿时判通过并留下证据", async () => {
    const node = makeNode({ id: "n01", tests: ["a.test.ts"] });
    const result = await runLevels({ cwd: dir, node, cfg, scope: "node" });
    expect(result.verdict).toBe("pass");
    expect(result.levels.unit?.exit).toBe(0);
  });
});

describe("recheckModule（复核第 3 层）", () => {
  it("module 级复跑通过", async () => {
    const result = await recheckModule({ cwd: dir, cfg, node: makeNode({ id: "n01" }) });
    expect(result.ok).toBe(true);
    expect(result.evidence?.exit).toBe(0);
  });

  it("复跑失败时报告原因", async () => {
    const failing = makeConfig();
    failing.levels[2] = { id: "module", required: true, how: "exit 7", scope: "integrate" };
    const result = await recheckModule({ cwd: dir, cfg: failing, node: makeNode({ id: "n01" }) });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("exit=7");
  });
});

describe("renderLevelCommand 的占位符", () => {
  it("替换 {tests} / {module} / {probes}", () => {
    const level = { id: "probe", required: true, how: "node --test {probes} # {module}", scope: "node" as const };
    const cmd = renderLevelCommand(level, {
      tests: ["t.mjs"],
      module: "events",
      probes: ["spec-probes/a.spec.mjs", "spec-probes/b.spec.mjs"],
    });
    expect(cmd).toBe("node --test spec-probes/a.spec.mjs spec-probes/b.spec.mjs # events");
  });

  it("没有 probes 时 {probes} 渲染为空串", () => {
    const level = { id: "probe", required: true, how: "node --test {probes}", scope: "node" as const };
    expect(renderLevelCommand(level, { tests: [], module: "m" })).toBe("node --test ");
  });
});
