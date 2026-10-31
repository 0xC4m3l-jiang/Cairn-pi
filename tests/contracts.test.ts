import { describe, expect, it } from "vitest";

import { ContractError, parseBoard, parseConfig } from "../lib/contracts";

/** 故意用宽松类型，便于在测试里构造非法结构。 */
interface LooseBoard {
  version: number;
  goal: Record<string, unknown>;
  survey: Record<string, unknown>;
  architecture: Record<string, unknown>;
  nodes: Array<Record<string, unknown>>;
  hints: unknown[];
  events: unknown[];
}

function makeBoard(): LooseBoard {
  return {
    version: 1,
    goal: { id: "T0", claim: "登录支持 magic link", acceptance: "点链接可登录" },
    survey: { modules: ["auth"], conventions: ["ts strict"], testCmd: "npm test" },
    architecture: {
      modules: [{ name: "auth", responsibility: "认证与会话", dependsOn: [] }],
      boundaries: [],
    },
    nodes: [
      {
        id: "n01",
        module: "auth",
        title: "实现 token 校验",
        requirement: "校验签名与过期",
        deps: [],
        touches: ["src/auth/magic.ts"],
        provides: ["validateMagicToken(token): Session | null"],
        consumes: [],
        acceptance: ["过期 token → 401"],
        tests: ["tests/auth/magic.test.ts"],
        status: "pending",
        attempts: 0,
        findings: [],
      },
    ],
    hints: [],
    events: [],
  };
}

const validConfigLevels = [
  { id: "unit", required: true, how: "npm test -- {tests}", scope: "node" },
  { id: "module", required: true, how: "npm run test:integration", scope: "integrate" },
];

describe("parseBoard", () => {
  it("接受结构完整的 board", () => {
    const board = parseBoard(makeBoard());
    expect(board.nodes).toHaveLength(1);
    expect(board.nodes[0]?.touches).toEqual(["src/auth/magic.ts"]);
    expect(board.goal.id).toBe("T0");
  });

  it("拒绝缺少 touches 的节点（边界门依赖它）", () => {
    const broken = makeBoard();
    delete broken.nodes[0]!["touches"];
    expect(() => parseBoard(broken)).toThrow(ContractError);
    expect(() => parseBoard(broken)).toThrow(/touches/);
  });

  it("拒绝空 touches", () => {
    const broken = makeBoard();
    broken.nodes[0]!["touches"] = [];
    expect(() => parseBoard(broken)).toThrow(/不能为空/);
  });

  it("拒绝重复的节点 id", () => {
    const broken = makeBoard();
    broken.nodes.push(structuredClone(broken.nodes[0]!));
    expect(() => parseBoard(broken)).toThrow(/id 重复/);
  });

  it("拒绝指向不存在节点的依赖", () => {
    const broken = makeBoard();
    broken.nodes[0]!["deps"] = ["n99"];
    expect(() => parseBoard(broken)).toThrow(/不存在的节点 n99/);
  });

  it("拒绝非整数的证据退出码", () => {
    const broken = makeBoard();
    broken.nodes[0]!["findings"] = [
      {
        claim: "已实现",
        status: "confirmed",
        evidence: {
          levels: { unit: { cmd: "npm test", exit: 0.5, excerpt: "ok" } },
          verifiedBy: "verify#1",
          at: "2026-10-31T00:00:00Z",
        },
      },
    ];
    expect(() => parseBoard(broken)).toThrow(/退出码/);
  });

  it("拒绝 module 未在 architecture.modules 声明的节点", () => {
    const broken = makeBoard();
    broken.nodes[0]!["module"] = "billing";
    expect(() => parseBoard(broken)).toThrow(/未在 architecture\.modules 中声明：billing/);
  });

  it("拒绝未知的 event kind（审计流不能写任意值）", () => {
    const broken = makeBoard();
    broken.events = [{ at: "2026-10-31T00:00:00Z", kind: "guessed", nodeId: null, detail: {} }];
    expect(() => parseBoard(broken)).toThrow(/kind/);
  });

  it("拒绝边界引用未声明的模块", () => {
    const broken = makeBoard();
    (broken.architecture as Record<string, unknown>)["boundaries"] = [
      { from: "auth", to: "nope", contract: "POST /login" },
    ];
    expect(() => parseBoard(broken)).toThrow(/to 未声明的模块：nope/);
  });

  it("拒绝未知的 finding 状态", () => {
    const broken = makeBoard();
    broken.nodes[0]!["findings"] = [
      {
        claim: "已实现",
        status: "probably-fine",
        evidence: { levels: {}, verifiedBy: "verify#1", at: "2026-10-31T00:00:00Z" },
      },
    ];
    expect(() => parseBoard(broken)).toThrow(/status/);
  });
});

describe("parseConfig", () => {
  it("接受合法配置并填充默认值", () => {
    const cfg = parseConfig({ levels: validConfigLevels });
    expect(cfg.maxAttempts).toBe(2);
    expect(cfg.reverifyModule).toBe(true);
    expect(cfg.levels[0]?.scope).toBe("node");
  });

  it("预算默认值可用，且可显式覆盖", () => {
    const cfg = parseConfig({ levels: validConfigLevels });
    expect(cfg.budget.maxTotalAttempts).toBe(20);
    expect(cfg.budget.maxWallClockMinutes).toBe(60);

    const custom = parseConfig({
      levels: validConfigLevels,
      budget: { maxTotalAttempts: 5, maxWallClockMinutes: 10 },
    });
    expect(custom.budget.maxTotalAttempts).toBe(5);
    expect(custom.budget.maxWallClockMinutes).toBe(10);
  });

  it("拒绝非正整数的预算", () => {
    expect(() =>
      parseConfig({ levels: validConfigLevels, budget: { maxTotalAttempts: 0 } }),
    ).toThrow(/maxTotalAttempts/);
  });

  it("拒绝没有 required 级别的配置（否则缺口会被放行）", () => {
    expect(() => parseConfig({ levels: [{ id: "unit", required: false, how: "npm test" }] })).toThrow(
      /required/,
    );
  });

  it("拒绝缺少命令模板的级别", () => {
    expect(() => parseConfig({ levels: [{ id: "unit", required: true }] })).toThrow(/how/);
  });

  it("拒绝重复的级别 id", () => {
    expect(() =>
      parseConfig({
        levels: [
          { id: "unit", required: true, how: "a" },
          { id: "unit", required: true, how: "b" },
        ],
      }),
    ).toThrow(/重复/);
  });

  it("拒绝非法的 scope", () => {
    expect(() =>
      parseConfig({ levels: [{ id: "unit", required: true, how: "a", scope: "global" }] }),
    ).toThrow(/scope/);
  });
});

describe("node.probes 契约", () => {
  const base = {
    version: 1,
    goal: { id: "T0", claim: "c", acceptance: "a" },
    survey: { modules: [], conventions: [], testCmd: "npm test" },
    architecture: { modules: [{ name: "m", responsibility: "r", dependsOn: [] }], boundaries: [] },
    hints: [],
    events: [{ at: "2026-01-01T00:00:00.000Z", kind: "gate", nodeId: null, detail: {} }],
    integrate: null,
  };
  const node = {
    id: "n01",
    module: "m",
    title: "t",
    requirement: "r",
    deps: [],
    touches: ["src/a.mjs"],
    provides: [],
    consumes: [],
    acceptance: ["a"],
    tests: ["tests/a.test.mjs"],
    status: "pending",
    attempts: 0,
    findings: [],
  };

  it("缺 probes 时回落为空数组（旧 board 仍可读）", () => {
    const board = parseBoard({ ...base, nodes: [{ ...node }] });
    expect(board.nodes[0]?.probes).toEqual([]);
  });

  it("probes 为合法数组时原样保留", () => {
    const board = parseBoard({ ...base, nodes: [{ ...node, probes: ["spec-probes/a.spec.mjs"] }] });
    expect(board.nodes[0]?.probes).toEqual(["spec-probes/a.spec.mjs"]);
  });

  it("probes 含空串时拒绝", () => {
    expect(() => parseBoard({ ...base, nodes: [{ ...node, probes: [""] }] })).toThrow(/probes/);
  });
});
