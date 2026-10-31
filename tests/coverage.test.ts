import { describe, expect, it } from "vitest";

import { goalDone, nodeCoverage, renderPlan, renderReport, renderStatus, traceMatrix } from "../lib/coverage";
import { nowIso } from "../lib/board";
import { bothLevels, evidence, finding, makeBoard, makeConfig, makeNode } from "./fixtures";

const cfg = makeConfig();

function integrateOk() {
  return { levels: { module: evidence("true", 0) }, verifiedBy: "verify#test", at: nowIso() };
}

describe("nodeCoverage", () => {
  it("无证据时各级为 missing", () => {
    const board = makeBoard({ nodes: [makeNode({ id: "n01" })] });
    expect(nodeCoverage(board, cfg)[0]?.levels).toEqual({ unit: "missing", acceptance: "missing" });
  });

  it("exit 0 记 pass，非 0 记 fail", () => {
    const board = makeBoard({
      nodes: [
        makeNode({
          id: "n01",
          findings: [finding({ unit: evidence("true", 0), acceptance: evidence("true", 1) })],
        }),
      ],
    });
    expect(nodeCoverage(board, cfg)[0]?.levels).toEqual({ unit: "pass", acceptance: "fail" });
  });

  it("只认 confirmed，candidate 不算覆盖", () => {
    const board = makeBoard({
      nodes: [makeNode({ id: "n01", findings: [finding(bothLevels(), "candidate")] })],
    });
    expect(nodeCoverage(board, cfg)[0]?.levels).toEqual({ unit: "missing", acceptance: "missing" });
  });
});

describe("goalDone", () => {
  it("有节点未完成时为 false", () => {
    const board = makeBoard({
      nodes: [makeNode({ id: "n01", status: "done" }), makeNode({ id: "n02" })],
      integrate: integrateOk(),
    });
    expect(goalDone(board, cfg)).toBe(false);
  });

  it("全部 done 且整体验收通过为 true", () => {
    const board = makeBoard({
      nodes: [makeNode({ id: "n01", status: "done" })],
      integrate: integrateOk(),
    });
    expect(goalDone(board, cfg)).toBe(true);
  });

  it("缺整体验收证据时为 false", () => {
    const board = makeBoard({ nodes: [makeNode({ id: "n01", status: "done" })] });
    expect(goalDone(board, cfg)).toBe(false);
  });

  it("整体验收失败时为 false", () => {
    const board = makeBoard({
      nodes: [makeNode({ id: "n01", status: "done" })],
      integrate: { levels: { module: evidence("true", 1) }, verifiedBy: "v", at: nowIso() },
    });
    expect(goalDone(board, cfg)).toBe(false);
  });

  it("空地图不算达成", () => {
    expect(goalDone(makeBoard(), cfg)).toBe(false);
  });
});

describe("renderStatus / renderReport", () => {
  it("状态栏含节点与目标行", () => {
    const board = makeBoard({
      nodes: [makeNode({ id: "n01", status: "done", findings: [finding(bothLevels())] }), makeNode({ id: "n02", deps: ["n01"] })],
      integrate: integrateOk(),
    });
    const text = renderStatus(board, cfg);
    expect(text).toContain("n01");
    expect(text).toContain("目标 T0");
    expect(text).toContain("1/2 节点完成");
  });

  it("空地图给出可操作提示", () => {
    expect(renderStatus(makeBoard(), cfg)).toContain("/cairn map");
  });

  it("追溯矩阵列出未验证项", () => {
    const board = makeBoard({ nodes: [makeNode({ id: "n01" })] });
    const text = renderReport(board, cfg);
    expect(text).toContain("| 模块 | 节点 | 需求 | 验收判据 | 状态 | 验收 | 证据 |");
    expect(text).toContain("未验证项：n01(pending)");
    expect(traceMatrix(board, cfg)).toHaveLength(1);
  });
});

describe("renderPlan", () => {
  it("列出模块数、节点、依赖与可改文件", () => {
    const board = makeBoard({
      nodes: [
        makeNode({ id: "n01", title: "实现 add", touches: ["src/a.ts"] }),
        makeNode({ id: "n02", title: "实现 sum", deps: ["n01"], touches: ["src/sum.ts"] }),
      ],
    });
    const plan = renderPlan(board);
    expect(plan).toContain("计划：1 模块 / 2 节点");
    expect(plan).toContain("实现 add");
    expect(plan).toContain("src/a.ts");
    expect(plan).toContain("deps: n01");
  });

  it("空地图给出下一步", () => {
    expect(renderPlan(makeBoard())).toContain("cairn-map");
  });
});
