/**
 * board.json / config.json 的读写、依赖派生、事件追加。文件 I/O 只在这里。
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  parseBoard,
  parseConfig,
  type CairnBoard,
  type CairnConfig,
  type CairnEvent,
  type CairnNode,
} from "./contracts";

export function cairnDir(cwd: string): string {
  return join(cwd, ".cairn");
}

export function boardPath(cwd: string): string {
  return join(cairnDir(cwd), "board.json");
}

export function configPath(cwd: string): string {
  return join(cairnDir(cwd), "config.json");
}

export function nowIso(): string {
  return new Date().toISOString();
}

function readJson<T>(path: string, label: string, parse: (value: unknown) => T): T {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    throw new Error(`读取 ${label} 失败：${(error as Error).message}`);
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} 不是合法 JSON（${path}）：${(error as Error).message}`);
  }
  return parse(value);
}

export function loadBoard(cwd: string): CairnBoard {
  const path = boardPath(cwd);
  if (!existsSync(path)) {
    throw new Error(`没有找到 ${path}。先运行 /cairn init --goal "..."`);
  }
  return readJson(path, "board.json", parseBoard);
}

/** 原子写：先写临时文件再 rename，中断不会留下半个 JSON。 */
export function saveBoard(cwd: string, board: CairnBoard): void {
  const path = boardPath(cwd);
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, `${JSON.stringify(board, null, 2)}\n`, "utf8");
  renameSync(tmp, path);
}

const DEFAULT_CONFIG = {
  levels: [
    { id: "unit", required: true, how: "npm test -- {tests}" },
    { id: "acceptance", required: true, how: "npm test -- {tests}" },
    { id: "module", required: true, how: "npm test", scope: "integrate" },
  ],
  maxAttempts: 2,
  reverifyModule: true,
  maxReplansPerModule: 2,
  budget: { maxTotalAttempts: 20, maxWallClockMinutes: 60 },
};

/** 缺失时返回默认阶梯，不抛错——新项目应当能直接跑起来。 */
export function loadConfig(cwd: string): CairnConfig {
  const path = configPath(cwd);
  if (!existsSync(path)) return parseConfig(DEFAULT_CONFIG);
  return readJson(path, "config.json", parseConfig);
}

export function saveConfig(cwd: string, raw: unknown): void {
  const path = configPath(cwd);
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, `${JSON.stringify(raw, null, 2)}\n`, "utf8");
  renameSync(tmp, path);
}

export function appendEvent(
  board: CairnBoard,
  event: { kind: CairnEvent["kind"]; nodeId?: string | null; detail?: Record<string, unknown> },
): void {
  board.events.push({
    at: nowIso(),
    kind: event.kind,
    nodeId: event.nodeId ?? null,
    detail: event.detail ?? {},
  });
}

export function findNode(board: CairnBoard, id: string): CairnNode | undefined {
  return board.nodes.find((node) => node.id === id);
}

function requireNode(board: CairnBoard, id: string): CairnNode {
  const node = findNode(board, id);
  if (!node) throw new Error(`节点不存在：${id}`);
  return node;
}

/** 直接与传递依赖某个节点的所有节点（不含自身）。重规划范围用它。 */
export function dependents(board: CairnBoard, id: string): CairnNode[] {
  requireNode(board, id);
  const result = new Map<string, CairnNode>();
  const queue = [id];
  const visited = new Set<string>([id]);
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const node of board.nodes) {
      if (!node.deps.includes(current)) continue;
      if (visited.has(node.id)) continue;
      visited.add(node.id);
      result.set(node.id, node);
      queue.push(node.id);
    }
  }
  return [...result.values()];
}

/** 把 deps 全部 done 的 pending 节点提升为 ready。幂等。 */
export function refreshReady(board: CairnBoard): void {
  const done = new Set(board.nodes.filter((node) => node.status === "done").map((node) => node.id));
  for (const node of board.nodes) {
    if (node.status !== "pending") continue;
    if (node.deps.every((dep) => done.has(dep))) node.status = "ready";
  }
}

/** 返回一个依赖环上的节点 id 列表；无环返回 null。用于 STUCK 判定。 */
export function findCycle(board: CairnBoard): string[] | null {
  const byId = new Map(board.nodes.map((node) => [node.id, node]));
  const state = new Map<string, "visiting" | "done">();
  const stack: string[] = [];

  const visit = (id: string): string[] | null => {
    const mark = state.get(id);
    if (mark === "done") return null;
    if (mark === "visiting") {
      const start = stack.indexOf(id);
      return stack.slice(start === -1 ? 0 : start);
    }
    state.set(id, "visiting");
    stack.push(id);
    const node = byId.get(id);
    for (const dep of node?.deps ?? []) {
      if (!byId.has(dep)) continue;
      const found = visit(dep);
      if (found) return found;
    }
    stack.pop();
    state.set(id, "done");
    return null;
  };

  for (const node of board.nodes) {
    const found = visit(node.id);
    if (found) return found;
  }
  return null;
}

export function recreateBoard(input: {
  goal: string;
  goalAcceptance: string;
  origin?: string;
  modules?: string[];
  testCmd?: string;
}): CairnBoard {
  const modules = input.modules ?? [];
  return {
    version: 1,
    goal: { id: "T0", claim: input.goal, acceptance: input.goalAcceptance },
    survey: {
      modules,
      conventions: [],
      testCmd: input.testCmd ?? "npm test",
    },
    architecture: {
      modules: modules.map((name) => ({ name, responsibility: "", dependsOn: [] })),
      boundaries: [],
    },
    nodes: [],
    hints: [],
    events: [
      {
        at: nowIso(),
        kind: "gate",
        nodeId: null,
        detail: { phase: "init", origin: input.origin ?? "" },
      },
    ],
    integrate: null,
  };
}
