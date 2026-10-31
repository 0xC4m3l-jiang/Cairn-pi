import { nowIso } from "../lib/board";
import {
  parseBoard,
  parseConfig,
  type CairnBoard,
  type CairnConfig,
  type CairnNode,
  type EvidenceLevel,
  type Finding,
  type IntegrateEvidence,
} from "../lib/contracts";

export function evidence(cmd: string, exit: number, excerpt = "ok"): EvidenceLevel {
  return { cmd, exit, excerpt };
}

export function finding(levels: Record<string, EvidenceLevel>, status: Finding["status"] = "confirmed"): Finding {
  return { claim: "节点产出", status, evidence: { levels, verifiedBy: "verify#test", at: nowIso() } };
}

export function makeNode(over: Partial<CairnNode> & { id: string }): CairnNode {
  return {
    module: "auth",
    title: over.id,
    requirement: `${over.id} 的需求切片`,
    deps: [],
    touches: ["src/auth/"],
    provides: [],
    consumes: [],
    acceptance: ["可判定"],
    tests: ["tests/auth/a.test.ts"],
    probes: [],
    status: "pending",
    attempts: 0,
    findings: [],
    ...over,
  };
}

export function makeBoard(input: { nodes?: CairnNode[]; integrate?: IntegrateEvidence | null } = {}): CairnBoard {
  return parseBoard({
    version: 1,
    goal: { id: "T0", claim: "目标", acceptance: "判据" },
    survey: { modules: ["auth"], conventions: [], testCmd: "npm test" },
    architecture: { modules: [{ name: "auth", responsibility: "认证", dependsOn: [] }], boundaries: [] },
    nodes: input.nodes ?? [],
    hints: [],
    events: [{ at: nowIso(), kind: "gate", nodeId: null, detail: {} }],
    integrate: input.integrate ?? null,
  });
}

export function makeConfig(over: Partial<CairnConfig> = {}): CairnConfig {
  const base = parseConfig({
    levels: [
      { id: "unit", required: true, how: "true {tests}" },
      { id: "acceptance", required: true, how: "true {tests}" },
      { id: "module", required: true, how: "true", scope: "integrate" },
    ],
    maxAttempts: 2,
    reverifyModule: true,
    maxReplansPerModule: 2,
    budget: { maxTotalAttempts: 20, maxWallClockMinutes: 60 },
  });
  return { ...base, ...over };
}

export function bothLevels(): Record<string, EvidenceLevel> {
  return { unit: evidence("true tests/auth/a.test.ts", 0), acceptance: evidence("true tests/auth/a.test.ts", 0) };
}
