/**
 * board.json / config.json 的类型与校验。无副作用、不依赖 pi 运行时。
 * 字段含义见 DESIGN.md §5。
 */

export type NodeStatus = "pending" | "ready" | "running" | "done" | "failed";
export type FindingStatus = "candidate" | "confirmed" | "refuted";
export type EventKind = "claim" | "submit" | "verify" | "fail" | "replan" | "gate";

export const NODE_STATUSES: readonly NodeStatus[] = ["pending", "ready", "running", "done", "failed"];
export const FINDING_STATUSES: readonly FindingStatus[] = ["candidate", "confirmed", "refuted"];
export const EVENT_KINDS: readonly EventKind[] = ["claim", "submit", "verify", "fail", "replan", "gate"];

export interface EvidenceLevel {
  cmd: string;
  exit: number;
  excerpt: string;
}

export interface Finding {
  claim: string;
  status: FindingStatus;
  evidence: {
    levels: Record<string, EvidenceLevel>;
    verifiedBy: string;
    at: string;
  };
}

export interface CairnNode {
  id: string;
  module: string;
  title: string;
  requirement: string;
  deps: string[];
  touches: string[];
  provides: string[];
  consumes: string[];
  acceptance: string[];
  tests: string[];
  /** 规格探针文件：从 requirement 逐条推导出的边界断言，运行时用 `{probes}` 占位符引用。 */
  probes: string[];
  status: NodeStatus;
  attempts: number;
  findings: Finding[];
}

export interface CairnEvent {
  at: string;
  kind: EventKind;
  nodeId: string | null;
  detail: Record<string, unknown>;
}

export interface CairnHint {
  id: string;
  content: string;
  at: string;
}

export interface ArchitectureModule {
  name: string;
  responsibility: string;
  dependsOn: string[];
}

export interface ArchitectureBoundary {
  from: string;
  to: string;
  contract: string;
}

export interface IntegrateEvidence {
  levels: Record<string, EvidenceLevel>;
  verifiedBy: string;
  at: string;
}

export interface CairnBoard {
  version: 1;
  goal: { id: string; claim: string; acceptance: string };
  survey: { modules: string[]; conventions: string[]; testCmd: string };
  architecture: { modules: ArchitectureModule[]; boundaries: ArchitectureBoundary[] };
  nodes: CairnNode[];
  hints: CairnHint[];
  events: CairnEvent[];
  /** 整体（module 级）验收证据，由 /cairn integrate 写入。 */
  integrate: IntegrateEvidence | null;
}

export type LevelScope = "node" | "integrate";

export interface LevelConfig {
  id: string;
  required: boolean;
  how: string;
  scope: LevelScope;
}

export interface BudgetConfig {
  /** 全流程 attempt 总上限，超过即 BUDGET_EXHAUSTED。 */
  maxTotalAttempts: number;
  /** 从 /cairn map 起算的墙上时间上限，超过即 BUDGET_EXHAUSTED。 */
  maxWallClockMinutes: number;
}

export interface CairnConfig {
  levels: LevelConfig[];
  maxAttempts: number;
  reverifyModule: boolean;
  maxReplansPerModule: number;
  budget: BudgetConfig;
}

export class ContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContractError";
  }
}

function fail(path: string, message: string): never {
  throw new ContractError(`${path}: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) fail(path, "必须是对象");
  return value;
}

function asString(rec: Record<string, unknown>, key: string, path: string): string {
  const value = rec[key];
  if (typeof value !== "string" || value.trim() === "") fail(`${path}.${key}`, "必须是非空字符串");
  return value;
}

function asNumber(rec: Record<string, unknown>, key: string, path: string): number {
  const value = rec[key];
  if (typeof value !== "number" || !Number.isFinite(value)) fail(`${path}.${key}`, "必须是有限数字");
  return value;
}

function asBool(rec: Record<string, unknown>, key: string, path: string): boolean {
  const value = rec[key];
  if (typeof value !== "boolean") fail(`${path}.${key}`, "必须是布尔值");
  return value;
}

function asStringArray(rec: Record<string, unknown>, key: string, path: string): string[] {
  const value = rec[key];
  if (!Array.isArray(value)) fail(`${path}.${key}`, "必须是数组");
  return value.map((item, index) => {
    if (typeof item !== "string" || item.trim() === "") {
      fail(`${path}.${key}[${index}]`, "必须是非空字符串");
    }
    return item;
  });
}

function asObjectArray(rec: Record<string, unknown>, key: string, path: string): unknown[] {
  const value = rec[key];
  if (!Array.isArray(value)) fail(`${path}.${key}`, "必须是数组");
  return value;
}

function parseEvidenceLevel(raw: unknown, path: string): EvidenceLevel {
  const rec = asRecord(raw, path);
  const exit = asNumber(rec, "exit", path);
  if (!Number.isInteger(exit)) fail(`${path}.exit`, "必须是整数（退出码）");
  return {
    cmd: asString(rec, "cmd", path),
    exit,
    excerpt: asString(rec, "excerpt", path),
  };
}

function parseFinding(raw: unknown, path: string): Finding {
  const rec = asRecord(raw, path);
  const status = asString(rec, "status", path);
  if (!FINDING_STATUSES.includes(status as FindingStatus)) {
    fail(`${path}.status`, `必须是 ${FINDING_STATUSES.join(" | ")}`);
  }
  const evidence = asRecord(rec["evidence"], `${path}.evidence`);
  const levelsRaw = asRecord(evidence.levels, `${path}.evidence.levels`);
  const levels: Record<string, EvidenceLevel> = {};
  for (const [levelId, levelValue] of Object.entries(levelsRaw)) {
    levels[levelId] = parseEvidenceLevel(levelValue, `${path}.evidence.levels.${levelId}`);
  }
  return {
    claim: asString(rec, "claim", path),
    status: status as FindingStatus,
    evidence: {
      levels,
      verifiedBy: asString(evidence, "verifiedBy", `${path}.evidence`),
      at: asString(evidence, "at", `${path}.evidence`),
    },
  };
}

function parseNode(raw: unknown, path: string): CairnNode {
  const rec = asRecord(raw, path);
  const status = asString(rec, "status", path);
  if (!NODE_STATUSES.includes(status as NodeStatus)) {
    fail(`${path}.status`, `必须是 ${NODE_STATUSES.join(" | ")}`);
  }
  const touches = asStringArray(rec, "touches", path);
  if (touches.length === 0) fail(`${path}.touches`, "不能为空（边界门依赖它）");

  const findings = asObjectArray(rec, "findings", path).map((item, index) =>
    parseFinding(item, `${path}.findings[${index}]`),
  );

  return {
    id: asString(rec, "id", path),
    module: asString(rec, "module", path),
    title: asString(rec, "title", path),
    requirement: asString(rec, "requirement", path),
    deps: asStringArray(rec, "deps", path),
    touches,
    provides: asStringArray(rec, "provides", path),
    consumes: asStringArray(rec, "consumes", path),
    acceptance: asStringArray(rec, "acceptance", path),
    tests: asStringArray(rec, "tests", path),
    // 向后兼容：缺失时视为空数组（旧 board 仍可读），但含 {probes} 的级别会判 missing
    probes: rec.probes === undefined ? [] : asStringArray(rec, "probes", path),
    status: status as NodeStatus,
    attempts: asNumber(rec, "attempts", path),
    findings,
  };
}

function parseArchModule(raw: unknown, path: string): ArchitectureModule {
  const rec = asRecord(raw, path);
  return {
    name: asString(rec, "name", path),
    responsibility: asString(rec, "responsibility", path),
    dependsOn: asStringArray(rec, "dependsOn", path),
  };
}

function parseArchBoundary(raw: unknown, path: string): ArchitectureBoundary {
  const rec = asRecord(raw, path);
  return {
    from: asString(rec, "from", path),
    to: asString(rec, "to", path),
    contract: asString(rec, "contract", path),
  };
}

function parseEvent(raw: unknown, path: string): CairnEvent {
  const rec = asRecord(raw, path);
  const kind = asString(rec, "kind", path);
  if (!EVENT_KINDS.includes(kind as EventKind)) {
    fail(`${path}.kind`, `必须是 ${EVENT_KINDS.join(" | ")}`);
  }
  const nodeId = rec["nodeId"];
  if (nodeId !== null && typeof nodeId !== "string") fail(`${path}.nodeId`, "必须是字符串或 null");
  return {
    at: asString(rec, "at", path),
    kind: kind as EventKind,
    nodeId: nodeId as string | null,
    detail: asRecord(rec.detail ?? {}, `${path}.detail`),
  };
}

/** 校验并构造 board。任何结构问题抛 ContractError。 */
export function parseBoard(raw: unknown): CairnBoard {
  const rec = asRecord(raw, "board");
  if (rec.version !== 1) fail("board.version", "目前只支持 1");

  const goalRec = asRecord(rec.goal, "board.goal");
  const surveyRec = asRecord(rec.survey, "board.survey");
  const archRec = asRecord(rec.architecture, "board.architecture");
  const modules = asObjectArray(archRec, "modules", "board.architecture").map((item, index) =>
    parseArchModule(item, `board.architecture.modules[${index}]`),
  );
  const boundaries = asObjectArray(archRec, "boundaries", "board.architecture").map((item, index) =>
    parseArchBoundary(item, `board.architecture.boundaries[${index}]`),
  );

  const nodes = asObjectArray(rec, "nodes", "board").map((item, index) =>
    parseNode(item, `board.nodes[${index}]`),
  );

  const seen = new Set<string>();
  for (const node of nodes) {
    if (seen.has(node.id)) fail(`board.nodes`, `节点 id 重复：${node.id}`);
    seen.add(node.id);
  }
  for (const node of nodes) {
    for (const dep of node.deps) {
      if (!seen.has(dep)) fail(`board.nodes.${node.id}.deps`, `引用了不存在的节点 ${dep}`);
    }
  }

  const moduleNames = new Set(modules.map((module) => module.name));
  for (const node of nodes) {
    if (!moduleNames.has(node.module)) {
      fail(`board.nodes.${node.id}.module`, `未在 architecture.modules 中声明：${node.module}`);
    }
  }
  for (const boundary of boundaries) {
    if (!moduleNames.has(boundary.from)) {
      fail(`board.architecture.boundaries`, `from 未声明的模块：${boundary.from}`);
    }
    if (!moduleNames.has(boundary.to)) {
      fail(`board.architecture.boundaries`, `to 未声明的模块：${boundary.to}`);
    }
  }

  const hints = asObjectArray(rec, "hints", "board").map((item, index) => {
    const path = `board.hints[${index}]`;
    const hint = asRecord(item, path);
    return {
      id: asString(hint, "id", path),
      content: asString(hint, "content", path),
      at: asString(hint, "at", path),
    };
  });

  const events = asObjectArray(rec, "events", "board").map((item, index) =>
    parseEvent(item, `board.events[${index}]`),
  );

  let integrate: IntegrateEvidence | null = null;
  if (rec.integrate !== undefined && rec.integrate !== null) {
    const raw = asRecord(rec.integrate, "board.integrate");
    const levelsRaw = asRecord(raw.levels, "board.integrate.levels");
    const levels: Record<string, EvidenceLevel> = {};
    for (const [levelId, levelValue] of Object.entries(levelsRaw)) {
      levels[levelId] = parseEvidenceLevel(levelValue, `board.integrate.levels.${levelId}`);
    }
    integrate = {
      levels,
      verifiedBy: asString(raw, "verifiedBy", "board.integrate"),
      at: asString(raw, "at", "board.integrate"),
    };
  }

  return {
    version: 1,
    goal: {
      id: asString(goalRec, "id", "board.goal"),
      claim: asString(goalRec, "claim", "board.goal"),
      acceptance: asString(goalRec, "acceptance", "board.goal"),
    },
    survey: {
      modules: asStringArray(surveyRec, "modules", "board.survey"),
      conventions: asStringArray(surveyRec, "conventions", "board.survey"),
      testCmd: asString(surveyRec, "testCmd", "board.survey"),
    },
    architecture: { modules, boundaries },
    nodes,
    hints,
    events,
    integrate,
  };
}

/** 校验并构造 config。缺少必需级别模板时拒绝。 */
export function parseConfig(raw: unknown): CairnConfig {
  const rec = asRecord(raw, "config");
  const levelsRaw = asObjectArray(rec, "levels", "config");
  if (levelsRaw.length === 0) fail("config.levels", "至少要声明一个验收级别");
  if (!levelsRaw.some((item) => isRecord(item) && item.required === true)) {
    fail("config.levels", "至少要有一个 required 级别，否则任何缺口都会被放行");
  }

  const levels = levelsRaw.map((item, index) => {
    const path = `config.levels[${index}]`;
    const level = asRecord(item, path);
    const scope = level.scope === undefined ? "node" : level.scope;
    if (scope !== "node" && scope !== "integrate") {
      fail(`${path}.scope`, `必须是 node | integrate`);
    }
    return {
      id: asString(level, "id", path),
      required: asBool(level, "required", path),
      how: asString(level, "how", path),
      scope: scope as LevelScope,
    };
  });

  const ids = new Set(levels.map((level) => level.id));
  if (ids.size !== levels.length) fail("config.levels", "级别 id 重复");

  const maxAttempts = rec.maxAttempts === undefined ? 2 : asNumber(rec, "maxAttempts", "config");
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    fail("config.maxAttempts", "必须是 >= 1 的整数");
  }

  const budgetRec = rec.budget === undefined ? {} : asRecord(rec.budget, "config.budget");
  const maxTotalAttempts =
    budgetRec.maxTotalAttempts === undefined
      ? 20
      : asNumber(budgetRec, "maxTotalAttempts", "config.budget");
  if (!Number.isInteger(maxTotalAttempts) || maxTotalAttempts < 1) {
    fail("config.budget.maxTotalAttempts", "必须是 >= 1 的整数");
  }
  const maxWallClockMinutes =
    budgetRec.maxWallClockMinutes === undefined
      ? 60
      : asNumber(budgetRec, "maxWallClockMinutes", "config.budget");
  if (!Number.isInteger(maxWallClockMinutes) || maxWallClockMinutes < 1) {
    fail("config.budget.maxWallClockMinutes", "必须是 >= 1 的整数");
  }

  return {
    levels,
    maxAttempts,
    reverifyModule: rec.reverifyModule === undefined ? true : asBool(rec, "reverifyModule", "config"),
    maxReplansPerModule:
      rec.maxReplansPerModule === undefined ? 2 : asNumber(rec, "maxReplansPerModule", "config"),
    budget: { maxTotalAttempts, maxWallClockMinutes },
  };
}
