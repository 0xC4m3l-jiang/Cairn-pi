import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import cairnExtension from "../extensions/cairn";
import { loadBoard } from "../lib/board";

interface FakeTool {
  name: string;
  execute: (
    id: string,
    params: Record<string, unknown>,
    signal?: unknown,
    onUpdate?: unknown,
    ctx?: unknown,
  ) => Promise<{ content: Array<{ text: string }>; details: unknown }>;
}

function setup(cwd: string) {
  const tools = new Map<string, FakeTool>();
  const commands = new Map<string, { handler: (args: string, ctx: unknown) => Promise<void> }>();
  cairnExtension({
    registerTool: (tool: FakeTool) => tools.set(tool.name, tool),
    registerCommand: (name: string, options: { handler: (args: string, ctx: unknown) => Promise<void> }) =>
      commands.set(name, options),
  } as never);

  const messages: string[] = [];
  const ctx = {
    cwd,
    hasUI: true,
    mode: "tui",
    ui: {
      notify: (message: string) => messages.push(message),
      confirm: async () => false,
    },
  };

  return {
    messages,
    call: async (name: string, params: Record<string, unknown> = {}) => {
      const tool = tools.get(name);
      if (!tool) throw new Error(`工具未注册：${name}`);
      return tool.execute(`tc-${name}`, params, undefined, undefined, ctx);
    },
    run: async (args: string) => {
      const command = commands.get("cairn");
      if (!command) throw new Error("命令 cairn 未注册");
      await command.handler(args, ctx);
    },
  };
}

const cwd = mkdtempSync(join(tmpdir(), "cairn-e2e-"));

mkdirSync(join(cwd, ".cairn"), { recursive: true });
writeFileSync(
  join(cwd, ".cairn", "config.json"),
  JSON.stringify(
    {
      levels: [
        { id: "unit", required: true, how: "true {tests}" },
        { id: "acceptance", required: true, how: "true {tests}" },
        { id: "module", required: true, how: "true", scope: "integrate" },
      ],
      maxAttempts: 2,
      reverifyModule: true,
      maxReplansPerModule: 2,
      budget: { maxTotalAttempts: 20, maxWallClockMinutes: 60 },
    },
    null,
    2,
  ),
);

const NODES = [
  {
    id: "n01",
    module: "math",
    title: "实现 add",
    requirement: "add(a,b) 返回两数之和",
    deps: [],
    touches: ["src/add.ts", "tests/add.test.ts"],
    provides: ["add(a: number, b: number): number"],
    consumes: [],
    acceptance: ["1+2 === 3", "负数相加正确"],
    tests: ["tests/add.test.ts"],
  },
  {
    id: "n02",
    module: "math",
    title: "实现 sum",
    requirement: "sum(xs) 用 add 累加",
    deps: ["n01"],
    touches: ["src/sum.ts", "tests/sum.test.ts"],
    provides: ["sum(xs: number[]): number"],
    consumes: ["add(a: number, b: number): number"],
    acceptance: ["[] → 0", "[1,2,3] → 6"],
    tests: ["tests/sum.test.ts"],
  },
];

afterAll(() => {
  rmSync(cwd, { recursive: true, force: true });
});

describe("cairn-pi 端到端", () => {
  it("init 建立黑板", async () => {
    const api = setup(cwd);
    await api.run('init --goal "补 add 与 sum 并让测试通过"');
    const board = loadBoard(cwd);
    expect(board.goal.claim).toContain("add");
    expect(board.nodes).toHaveLength(0);
  });

  it("map_write 写入节点图并把无依赖节点置 ready", async () => {
    const api = setup(cwd);
    const result = await api.call("cairn_map_write", {
      modules: [{ name: "math", responsibility: "纯算术", dependsOn: [] }],
      nodes: NODES,
    });
    expect(result.content[0]?.text).toContain("n01");

    const board = loadBoard(cwd);
    expect(board.nodes.find((node) => node.id === "n01")?.status).toBe("ready");
    expect(board.nodes.find((node) => node.id === "n02")?.status).toBe("pending");
  });

  it("闸门：未确认时 execute 停住，--yes 才放行", async () => {
    const api = setup(cwd);
    await api.run("execute");
    expect(api.messages.join("\n")).toContain("未确认");
    expect(loadBoard(cwd).events.some((event) => event.detail["phase"] === "confirmed")).toBe(false);

    await api.run("execute --yes");
    expect(loadBoard(cwd).events.some((event) => event.detail["phase"] === "confirmed")).toBe(true);
  });

  it("依赖门：n02 在 n01 完成前不能认领", async () => {
    const api = setup(cwd);
    await expect(api.call("cairn_node_claim", { nodeId: "n02" })).rejects.toThrow(/依赖未完成/);
  });

  it("边界门：越界改动被拒，界内通过", async () => {
    const api = setup(cwd);
    const claim = await api.call("cairn_node_claim", { nodeId: "n01" });
    // claim 一次返回完整切片，省掉单独 cairn_board_read
    expect(claim.content[0]?.text).toContain("需求：add(a,b) 返回两数之和");
    expect(claim.content[0]?.text).toContain("验收判据：");
    await expect(
      api.call("cairn_node_submit", {
        nodeId: "n01",
        claim: "实现了 add",
        changedFiles: ["src/elsewhere.ts"],
      }),
    ).rejects.toThrow(/越界/);

    const ok = await api.call("cairn_node_submit", {
      nodeId: "n01",
      claim: "实现了 add 与两个用例",
      changedFiles: ["src/add.ts", "tests/add.test.ts"],
    });
    expect(ok.content[0]?.text).toContain("候选产出");
  });

  it("证据门：验收通过后节点 done，未验前不是 done", async () => {
    const api = setup(cwd);
    expect(loadBoard(cwd).nodes.find((node) => node.id === "n01")?.status).toBe("running");

    const result = await api.call("cairn_node_verify", { nodeId: "n01", run: true });
    expect(result.content[0]?.text).toContain("done");
    expect(loadBoard(cwd).nodes.find((node) => node.id === "n01")?.status).toBe("done");
  });

  it("n01 完成后 n02 才可认领并通过", async () => {
    const api = setup(cwd);
    await api.call("cairn_node_claim", { nodeId: "n02" });
    await api.call("cairn_node_submit", {
      nodeId: "n02",
      claim: "实现了 sum",
      changedFiles: ["src/sum.ts", "tests/sum.test.ts"],
    });
    const result = await api.call("cairn_node_verify", { nodeId: "n02", run: true });
    expect(result.content[0]?.text).toContain("done");
  });

  it("整体验收后目标达成", async () => {
    const api = setup(cwd);
    await api.run("integrate");
    const coverage = await api.call("cairn_coverage");
    expect(coverage.details).toMatchObject({ goalDone: true });
    expect(loadBoard(cwd).integrate?.levels["module"]?.exit).toBe(0);
  });

  it("report 输出追溯矩阵且无未验证项", async () => {
    const api = setup(cwd);
    const report = await api.call("cairn_report");
    expect(report.content[0]?.text).toContain("| 模块 | 节点 | 需求 | 验收判据 | 状态 | 验收 | 证据 |");
    expect(report.content[0]?.text).toContain("未验证项：无");
  });
});

describe("中断恢复 resume", () => {
  it("把中断遗留的 running 节点重置为 ready", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cairn-resume-"));
    try {
      const api = setup(dir);
      await api.run('init --goal "测试恢复"');
      await api.call("cairn_map_write", {
        modules: [{ name: "math", responsibility: "纯算术", dependsOn: [] }],
        nodes: NODES,
      });
      await api.call("cairn_node_claim", { nodeId: "n01" });
      expect(loadBoard(dir).nodes.find((node) => node.id === "n01")?.status).toBe("running");

      await api.run("resume");
      expect(loadBoard(dir).nodes.find((node) => node.id === "n01")?.status).toBe("ready");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
