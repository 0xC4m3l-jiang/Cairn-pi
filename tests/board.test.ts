import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  appendEvent,
  boardPath,
  dependents,
  findCycle,
  loadBoard,
  refreshReady,
  saveBoard,
} from "../lib/board";
import { makeBoard, makeNode } from "./fixtures";

let cwd = "";

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "cairn-board-"));
});

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
});

describe("saveBoard / loadBoard", () => {
  it("往返保留节点与 integrate", () => {
    const board = makeBoard({ nodes: [makeNode({ id: "n01" })] });
    saveBoard(cwd, board);
    const loaded = loadBoard(cwd);
    expect(loaded.nodes).toHaveLength(1);
    expect(loaded.nodes[0]?.id).toBe("n01");
    expect(loaded.integrate).toBeNull();
  });

  it("文件缺失时给出可操作提示", () => {
    expect(() => loadBoard(cwd)).toThrow(/cairn init/);
  });

  it("原子写不残留临时文件", () => {
    saveBoard(cwd, makeBoard());
    const files = readdirSync(join(cwd, ".cairn"));
    expect(files).toEqual(["board.json"]);
    expect(() => JSON.parse(readFileSync(boardPath(cwd), "utf8"))).not.toThrow();
  });
});

describe("dependents", () => {
  it("返回传递闭包且不含自身", () => {
    const board = makeBoard({
      nodes: [
        makeNode({ id: "n01" }),
        makeNode({ id: "n02", deps: ["n01"] }),
        makeNode({ id: "n03", deps: ["n02"] }),
        makeNode({ id: "n09" }),
      ],
    });
    expect(dependents(board, "n01").map((node) => node.id).sort()).toEqual(["n02", "n03"]);
    expect(dependents(board, "n03")).toEqual([]);
  });

  it("节点不存在时报错", () => {
    expect(() => dependents(makeBoard(), "nope")).toThrow(/不存在/);
  });
});

describe("refreshReady", () => {
  it("只把依赖全 done 的 pending 提升为 ready", () => {
    const board = makeBoard({
      nodes: [
        makeNode({ id: "n01", status: "done" }),
        makeNode({ id: "n02", deps: ["n01"] }),
        makeNode({ id: "n03", deps: ["n02"] }),
      ],
    });
    refreshReady(board);
    expect(board.nodes.find((node) => node.id === "n02")?.status).toBe("ready");
    expect(board.nodes.find((node) => node.id === "n03")?.status).toBe("pending");
  });

  it("幂等：重复调用不改变结果", () => {
    const board = makeBoard({ nodes: [makeNode({ id: "n01" })] });
    refreshReady(board);
    refreshReady(board);
    expect(board.nodes[0]?.status).toBe("ready");
  });
});

describe("findCycle", () => {
  it("检测依赖环", () => {
    const board = makeBoard({
      nodes: [makeNode({ id: "n01", deps: ["n02"] }), makeNode({ id: "n02", deps: ["n01"] })],
    });
    expect(findCycle(board)?.sort()).toEqual(["n01", "n02"]);
  });

  it("无环返回 null", () => {
    const board = makeBoard({
      nodes: [makeNode({ id: "n01" }), makeNode({ id: "n02", deps: ["n01"] })],
    });
    expect(findCycle(board)).toBeNull();
  });
});

describe("appendEvent", () => {
  it("追加带时间戳的事件", () => {
    const board = makeBoard();
    const before = board.events.length;
    appendEvent(board, { kind: "claim", nodeId: "n01", detail: { worker: "w1" } });
    expect(board.events).toHaveLength(before + 1);
    const last = board.events[board.events.length - 1]!;
    expect(last.kind).toBe("claim");
    expect(last.nodeId).toBe("n01");
    expect(Number.isNaN(Date.parse(last.at))).toBe(false);
  });
});
