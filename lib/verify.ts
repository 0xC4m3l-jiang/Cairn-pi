/**
 * 验收执行与证据复核。
 * 复核三层：命令一致性 → 证据形状 → module 级复跑（见 DESIGN §8.2）。
 */

import { spawn } from "node:child_process";

import type { CairnConfig, CairnNode, EvidenceLevel, LevelConfig, LevelScope } from "./contracts";
import { requiredLevels } from "./gates";

export const DEFAULT_TIMEOUT_MS = 300_000;
export const EXCERPT_LINES = 40;

export function renderLevelCommand(
  level: LevelConfig,
  node: Pick<CairnNode, "tests" | "module"> & { probes?: string[] },
): string {
  return level.how
    .replaceAll("{tests}", node.tests.join(" "))
    .replaceAll("{module}", node.module)
    .replaceAll("{probes}", (node.probes ?? []).join(" "));
}

export interface RunOptions {
  cwd: string;
  cmd: string;
  timeoutMs?: number;
}

/** 跑一条命令，返回原始证据（命令 + 退出码 + 输出尾部）。 */
export function runCommand(options: RunOptions): Promise<EvidenceLevel> {
  const { cwd, cmd } = options;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return new Promise<EvidenceLevel>((resolve) => {
    let settled = false;
    const finish = (value: EvidenceLevel) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(cmd, { cwd, shell: true, stdio: ["ignore", "pipe", "pipe"] });
    } catch (error) {
      finish({ cmd, exit: 127, excerpt: `spawn 失败：${(error as Error).message}` });
      return;
    }

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr += String(chunk);
    });
    child.on("error", (error: Error) => {
      clearTimeout(timer);
      finish({ cmd, exit: 127, excerpt: `spawn 失败：${error.message}` });
    });
    child.on("close", (code: number | null) => {
      clearTimeout(timer);
      const combined = `${stdout}${stderr}`.trim();
      const excerpt = combined.split("\n").slice(-EXCERPT_LINES).join("\n").trim();
      finish({ cmd, exit: timedOut ? 124 : (code ?? 1), excerpt: excerpt || "(无输出)" });
    });
  });
}

export interface LevelRunResult {
  levels: Record<string, EvidenceLevel>;
  verdict: "pass" | "fail";
  failures: string[];
  skipped: string[];
}

/** 按 scope 逐级跑验收。缺测试的级别直接记为失败，不放行。 */
export async function runLevels(input: {
  cwd: string;
  node: CairnNode;
  cfg: CairnConfig;
  scope: LevelScope;
  timeoutMs?: number;
}): Promise<LevelRunResult> {
  const levels: Record<string, EvidenceLevel> = {};
  const failures: string[] = [];
  const skipped: string[] = [];

  for (const level of requiredLevels(input.cfg, input.scope)) {
    if (level.how.includes("{tests}") && input.node.tests.length === 0) {
      skipped.push(level.id);
      failures.push(level.id);
      continue;
    }
    if (level.how.includes("{probes}") && input.node.probes.length === 0) {
      skipped.push(level.id);
      failures.push(level.id);
      continue;
    }
    const cmd = renderLevelCommand(level, input.node);
    const evidence = await runCommand({ cwd: input.cwd, cmd, timeoutMs: input.timeoutMs });
    levels[level.id] = evidence;
    if (evidence.exit !== 0) failures.push(level.id);
  }

  return { levels, verdict: failures.length === 0 ? "pass" : "fail", failures, skipped };
}

export type EvidenceVerdict = { ok: true } | { ok: false; reason: string };

/**
 * 第 1、2 层复核：命令必须与配置渲染结果一致；退出码必须是整数；片段不能为空。
 */
export function validateEvidence(input: {
  levels: Record<string, EvidenceLevel>;
  cfg: CairnConfig;
  expected: Record<string, string>;
  scope: LevelScope;
}): EvidenceVerdict {
  for (const level of requiredLevels(input.cfg, input.scope)) {
    const evidence = input.levels[level.id];
    if (!evidence) return { ok: false, reason: `缺 ${level.id} 级证据` };
    if (!Number.isInteger(evidence.exit)) {
      return { ok: false, reason: `${level.id} 的 exit 不是整数：${String(evidence.exit)}` };
    }
    if (typeof evidence.excerpt !== "string" || evidence.excerpt.trim() === "") {
      return { ok: false, reason: `${level.id} 的 excerpt 为空` };
    }
    const want = input.expected[level.id];
    if (want !== undefined && evidence.cmd.trim() !== want.trim()) {
      return {
        ok: false,
        reason: `${level.id} 命令不一致：期望「${want}」，实得「${evidence.cmd}」`,
      };
    }
  }
  return { ok: true };
}

/** 第 3 层复核：module 级由调用方（扩展）自己再跑一次并比对退出码。 */
export async function recheckModule(input: {
  cwd: string;
  cfg: CairnConfig;
  node: Pick<CairnNode, "tests" | "module">;
  timeoutMs?: number;
}): Promise<{ ok: boolean; evidence?: EvidenceLevel; reason?: string }> {
  const level = requiredLevels(input.cfg, "integrate")[0];
  if (!level || !input.cfg.reverifyModule) return { ok: true };
  const cmd = renderLevelCommand(level, input.node);
  const evidence = await runCommand({ cwd: input.cwd, cmd, timeoutMs: input.timeoutMs });
  if (evidence.exit === 0) return { ok: true, evidence };
  return { ok: false, evidence, reason: `module 级复跑失败：exit=${evidence.exit}` };
}
