import { describe, expect, it } from "vitest";

import {
  canClaim,
  canMarkDone,
  checkBudget,
  checkTouches,
  missingLevels,
  nodeAttemptsTotal,
} from "../lib/gates";
import { bothLevels, evidence, finding, makeBoard, makeConfig, makeNode } from "./fixtures";

const cfg = makeConfig();

describe("canClaim（依赖门）", () => {
  it("依赖未完成时拒绝并列出 blockedBy", () => {
    const board = makeBoard({
      nodes: [makeNode({ id: "n01" }), makeNode({ id: "n02", deps: ["n01"] })],
    });
    const result = canClaim(board, "n02");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.detail?.blockedBy).toEqual(["n01"]);
  });

  it("依赖全 done 时放行", () => {
    const board = makeBoard({
      nodes: [makeNode({ id: "n01", status: "done" }), makeNode({ id: "n02", deps: ["n01"] })],
    });
    expect(canClaim(board, "n02").ok).toBe(true);
  });

  it("已在运行时拒绝", () => {
    const board = makeBoard({ nodes: [makeNode({ id: "n01", status: "running" })] });
    expect(canClaim(board, "n01")).toMatchObject({ ok: false });
  });

  it("节点不存在时拒绝", () => {
    expect(canClaim(makeBoard(), "nope")).toMatchObject({ ok: false });
  });
});

describe("checkTouches（边界门）", () => {
  it("拒绝 touches 之外的路径", () => {
    const node = makeNode({ id: "n01", touches: ["src/auth/"] });
    expect(checkTouches(node, ["src/auth/magic.ts"])).toEqual({ ok: true });
    const result = checkTouches(node, ["src/billing/x.ts"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.violations).toEqual(["src/billing/x.ts"]);
  });

  it("精确路径与 ./ 前缀都归一化", () => {
    const node = makeNode({ id: "n01", touches: ["src/auth/magic.ts"] });
    expect(checkTouches(node, ["./src/auth/magic.ts"])).toEqual({ ok: true });
  });
});

describe("missingLevels（证据门）", () => {
  it("没有 finding 时所有必需级别都缺", () => {
    expect(missingLevels(makeNode({ id: "n01" }), cfg, "node")).toEqual(["unit", "acceptance"]);
  });

  it("缺测试时该级判缺（缺测试不放行）", () => {
    const node = makeNode({ id: "n01", tests: [], findings: [finding({ unit: evidence("true", 0), acceptance: evidence("true", 0) })] });
    expect(missingLevels(node, cfg, "node")).toEqual(["unit", "acceptance"]);
  });

  it("证据齐全时返回空", () => {
    const node = makeNode({ id: "n01", findings: [finding(bothLevels())] });
    expect(missingLevels(node, cfg, "node")).toEqual([]);
  });

  it("exit 非 0 视为缺失", () => {
    const node = makeNode({
      id: "n01",
      findings: [finding({ unit: evidence("true", 0), acceptance: evidence("true", 1) })],
    });
    expect(missingLevels(node, cfg, "node")).toEqual(["acceptance"]);
  });
});

describe("canMarkDone", () => {
  it("没有 confirmed 产出时拒绝", () => {
    const node = makeNode({ id: "n01", findings: [finding(bothLevels(), "candidate")] });
    expect(canMarkDone(node, cfg)).toMatchObject({ ok: false });
  });

  it("证据覆盖全部节点级时放行", () => {
    const node = makeNode({ id: "n01", findings: [finding(bothLevels())] });
    expect(canMarkDone(node, cfg)).toEqual({ ok: true });
  });
});

describe("checkBudget", () => {
  it("attempt 总数超限时拒绝", () => {
    const board = makeBoard({
      nodes: [makeNode({ id: "n01", attempts: 21 }), makeNode({ id: "n02", attempts: 0 })],
    });
    expect(nodeAttemptsTotal(board)).toBe(21);
    expect(checkBudget(board, cfg).ok).toBe(false);
  });

  it("墙上时间超限时拒绝", () => {
    const board = makeBoard();
    board.events[0]!.at = new Date(Date.now() - 61 * 60_000).toISOString();
    const result = checkBudget(board, cfg);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.detail?.kind).toBe("BUDGET_EXHAUSTED");
  });

  it("正常范围内放行", () => {
    expect(checkBudget(makeBoard(), cfg).ok).toBe(true);
  });
});

describe("spec probes 级别（{probes}）", () => {
  const probeCfg = makeConfig({
    levels: [
      { id: "unit", required: true, how: "true {tests}", scope: "node" },
      { id: "probe", required: true, how: "true {probes}", scope: "node" },
      { id: "module", required: true, how: "true", scope: "integrate" },
    ],
  });

  it("节点没声明 probes 时，probe 级判缺失", () => {
    const node = makeNode({ id: "n01", probes: [] });
    expect(missingLevels(node, probeCfg, "node")).toContain("probe");
  });

  it("声明了 probes 且有 exit 0 证据时通过", () => {
    const node = makeNode({
      id: "n01",
      probes: ["spec-probes/a.spec.mjs"],
      findings: [finding({ unit: evidence("true", 0), probe: evidence("true", 0) })],
    });
    expect(missingLevels(node, probeCfg, "node")).toEqual([]);
  });

  it("probe 级证据非 0 时仍判缺失", () => {
    const node = makeNode({
      id: "n01",
      probes: ["spec-probes/a.spec.mjs"],
      findings: [finding({ unit: evidence("true", 0), probe: evidence("true", 1) })],
    });
    expect(missingLevels(node, probeCfg, "node")).toContain("probe");
  });
});
