/**
 * 覆盖派生：节点状态、目标是否达成、追溯矩阵、状态栏渲染。
 * 覆盖永远是「算出来的」，不允许任何任务直接写完成。
 */

import type { CairnBoard, CairnConfig, CairnNode, Finding, LevelScope } from "./contracts";
import { requiredLevels } from "./gates";

export type LevelState = "pass" | "fail" | "missing";

export interface NodeCoverage {
  id: string;
  title: string;
  module: string;
  status: CairnNode["status"];
  levels: Record<string, LevelState>;
}

export interface TraceRow {
  target: string;
  node: string;
  requirement: string;
  acceptance: string;
  status: CairnNode["status"];
  levels: Record<string, LevelState>;
  evidence: string;
}

export function latestConfirmed(node: CairnNode): Finding | undefined {
  return [...node.findings].reverse().find((finding) => finding.status === "confirmed");
}

function levelStates(
  node: CairnNode,
  cfg: CairnConfig,
  scope: LevelScope,
): Record<string, LevelState> {
  const confirmed = latestConfirmed(node);
  const states: Record<string, LevelState> = {};
  for (const level of requiredLevels(cfg, scope)) {
    if (level.how.includes("{tests}") && node.tests.length === 0) {
      states[level.id] = "missing";
      continue;
    }
    if (level.how.includes("{probes}") && node.probes.length === 0) {
      states[level.id] = "missing";
      continue;
    }
    const evidence = confirmed?.evidence.levels[level.id];
    if (!evidence) {
      states[level.id] = "missing";
    } else {
      states[level.id] = evidence.exit === 0 ? "pass" : "fail";
    }
  }
  return states;
}

export function nodeCoverage(board: CairnBoard, cfg: CairnConfig): NodeCoverage[] {
  return board.nodes.map((node) => ({
    id: node.id,
    title: node.title,
    module: node.module,
    status: node.status,
    levels: levelStates(node, cfg, "node"),
  }));
}

/** 目标达成 = 全部节点 done，且 integrate 证据里每个必需级都通过。 */
export function goalDone(board: CairnBoard, cfg: CairnConfig): boolean {
  if (board.nodes.length === 0) return false;
  if (board.nodes.some((node) => node.status !== "done")) return false;
  for (const level of requiredLevels(cfg, "integrate")) {
    const evidence = board.integrate?.levels[level.id];
    if (!evidence || evidence.exit !== 0) return false;
  }
  return true;
}

export function traceMatrix(board: CairnBoard, cfg: CairnConfig): TraceRow[] {
  return board.nodes.map((node) => {
    const confirmed = latestConfirmed(node);
    const levels = levelStates(node, cfg, "node");
    const evidence = confirmed
      ? Object.values(confirmed.evidence.levels)
          .map((item) => `${item.cmd} → exit ${item.exit}`)
          .join(" ; ")
      : "（无证据）";
    return {
      target: node.module,
      node: `${node.id} ${node.title}`,
      requirement: node.requirement,
      acceptance: node.acceptance.join("；"),
      status: node.status,
      levels,
      evidence,
    };
  });
}

const STATUS_GLYPH: Record<CairnNode["status"], string> = {
  pending: "○",
  ready: "◑",
  running: "▶",
  done: "✓",
  failed: "✗",
};

const LEVEL_GLYPH: Record<LevelState, string> = {
  pass: "✓",
  fail: "✗",
  missing: "·",
};

export function renderStatus(board: CairnBoard, cfg: CairnConfig): string {
  const coverages = nodeCoverage(board, cfg);
  if (coverages.length === 0) {
    return `地图为空：还没有节点。运行 /cairn map 生成节点图。\n目标 ${board.goal.id}：${board.goal.claim}`;
  }
  const idWidth = Math.max(...coverages.map((item) => item.id.length), 2);
  const lines = coverages.map((item) => {
    const levels = Object.entries(item.levels)
      .map(([id, state]) => `${id} ${LEVEL_GLYPH[state]}`)
      .join("  ");
    return `${item.id.padEnd(idWidth)}  ${STATUS_GLYPH[item.status]} ${item.status.padEnd(8)} ${levels}`;
  });

  const done = coverages.filter((item) => item.status === "done").length;
  const integrateLevels = Object.entries(board.integrate?.levels ?? {})
    .map(([id, ev]) => `${id} ${ev.exit === 0 ? "✓" : "✗"}`)
    .join("  ");

  lines.push("");
  lines.push(
    `目标 ${board.goal.id}  ${goalDone(board, cfg) ? "✓ met" : "○ unmet"}   ${done}/${coverages.length} 节点完成`,
  );
  if (integrateLevels) lines.push(`整体验收  ${integrateLevels}`);
  if (board.hints.length > 0) lines.push(`提示 ${board.hints.length} 条`);
  return lines.join("\n");
}

export function renderPlan(board: CairnBoard): string {
  if (board.nodes.length === 0) {
    return "计划为空：还没有节点。先加载技能 cairn-map 生成节点图。";
  }
  const modules = board.architecture.modules.map((module) => module.name);
  const idWidth = Math.max(...board.nodes.map((node) => node.id.length), 2);
  const lines = [`计划：${modules.length} 模块 / ${board.nodes.length} 节点`];
  for (const node of board.nodes) {
    const deps = node.deps.length > 0 ? node.deps.join(",") : "—";
    lines.push(
      `${node.id.padEnd(idWidth)}  [${node.module}] ${node.title}  deps: ${deps}  可改: ${node.touches.join(", ")}`,
    );
  }
  return lines.join("\n");
}

export function renderReport(board: CairnBoard, cfg: CairnConfig): string {
  const rows = traceMatrix(board, cfg);
  const header =
    "| 模块 | 节点 | 需求 | 验收判据 | 状态 | 验收 | 证据 |\n| --- | --- | --- | --- | --- | --- | --- |";
  const body = rows.map((row) => {
    const levels = Object.entries(row.levels)
      .map(([id, state]) => `${id} ${LEVEL_GLYPH[state]}`)
      .join(" ");
    return `| ${row.target} | ${row.node} | ${row.requirement} | ${row.acceptance} | ${row.status} | ${levels} | ${row.evidence} |`;
  });
  const unresolved = board.nodes.filter((node) => node.status !== "done");
  const tail =
    unresolved.length === 0
      ? "\n未验证项：无"
      : `\n未验证项：${unresolved.map((node) => `${node.id}(${node.status})`).join("、")}`;
  return [`# 追溯矩阵\n`, header, ...body].join("\n") + tail;
}
