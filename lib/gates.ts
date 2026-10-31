/**
 * 三道门（依赖 / 边界 / 证据）+ 预算门。全部是纯判定，不做 I/O。
 */

import type { CairnBoard, CairnConfig, CairnNode, LevelConfig, LevelScope } from "./contracts";

export type GateResult = { ok: true } | { ok: false; reason: string; detail?: Record<string, unknown> };

const ok: GateResult = { ok: true };

export function requiredLevels(cfg: CairnConfig, scope: LevelScope): LevelConfig[] {
  return cfg.levels.filter((level) => level.required && level.scope === scope);
}

/** 依赖门：能否认领这个节点。 */
export function canClaim(board: CairnBoard, id: string): GateResult {
  const node = board.nodes.find((item) => item.id === id);
  if (!node) return { ok: false, reason: `节点不存在：${id}` };
  if (node.status === "running") return { ok: false, reason: `${id} 已在运行中` };
  if (node.status === "done") return { ok: false, reason: `${id} 已完成` };

  const blockedBy = node.deps.filter(
    (dep) => board.nodes.find((item) => item.id === dep)?.status !== "done",
  );
  if (blockedBy.length > 0) {
    return { ok: false, reason: `依赖未完成：${blockedBy.join(", ")}`, detail: { blockedBy } };
  }
  return ok;
}

/** 边界门：改动路径是否都在 touches 内。目录项以 `/` 结尾表示整棵子树。 */
export function checkTouches(
  node: CairnNode,
  changed: string[],
): { ok: true } | { ok: false; violations: string[] } {
  const normalize = (path: string) => path.replace(/^\.\//, "").trim();
  const allowed = node.touches.map(normalize);
  const violations = changed
    .map(normalize)
    .filter((path) => !allowed.some((entry) => path === entry || (entry.endsWith("/") && path.startsWith(entry))));
  return violations.length === 0 ? { ok: true } : { ok: false, violations };
}

/**
 * 该节点在该 scope 下缺哪些必需级别的证据。
 * 规则：`how` 里含 `{tests}` 而节点没写 tests、或含 `{probes}` 而节点没写 probes
 * → 该级视为缺失（缺测试/缺规格探针不放行）。
 */
export function missingLevels(
  node: CairnNode,
  cfg: CairnConfig,
  scope: LevelScope,
): string[] {
  const confirmed = [...node.findings].reverse().find((finding) => finding.status === "confirmed");
  const missing: string[] = [];
  for (const level of requiredLevels(cfg, scope)) {
    if (level.how.includes("{tests}") && node.tests.length === 0) {
      missing.push(level.id);
      continue;
    }
    if (level.how.includes("{probes}") && node.probes.length === 0) {
      missing.push(level.id);
      continue;
    }
    const evidence = confirmed?.evidence.levels[level.id];
    if (!evidence || evidence.exit !== 0) missing.push(level.id);
  }
  return missing;
}

/** 证据门：能否把节点标记为 done。 */
export function canMarkDone(node: CairnNode, cfg: CairnConfig): GateResult {
  const confirmed = node.findings.find((finding) => finding.status === "confirmed");
  if (!confirmed) return { ok: false, reason: `${node.id} 没有 confirmed 产出` };
  const missing = missingLevels(node, cfg, "node");
  if (missing.length > 0) {
    return { ok: false, reason: `证据不全：缺 ${missing.join(", ")}`, detail: { missing } };
  }
  return ok;
}

export function nodeAttemptsTotal(board: CairnBoard): number {
  return board.nodes.reduce((sum, node) => sum + node.attempts, 0);
}

/** 预算门：attempt 总数与墙上时间。 */
export function checkBudget(
  board: CairnBoard,
  cfg: CairnConfig,
  nowMs: number = Date.now(),
): GateResult {
  const attempts = nodeAttemptsTotal(board);
  if (attempts >= cfg.budget.maxTotalAttempts) {
    return {
      ok: false,
      reason: `attempt 预算耗尽（${attempts}/${cfg.budget.maxTotalAttempts}）`,
      detail: { kind: "BUDGET_EXHAUSTED" },
    };
  }
  const firstAt = board.events[0]?.at;
  if (firstAt) {
    const startedMs = Date.parse(firstAt);
    if (Number.isFinite(startedMs)) {
      const elapsedMinutes = (nowMs - startedMs) / 60000;
      if (elapsedMinutes > cfg.budget.maxWallClockMinutes) {
        return {
          ok: false,
          reason: `时间预算耗尽（${elapsedMinutes.toFixed(1)}/${cfg.budget.maxWallClockMinutes} 分钟）`,
          detail: { kind: "BUDGET_EXHAUSTED" },
        };
      }
    }
  }
  return ok;
}
