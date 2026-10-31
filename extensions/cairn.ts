/**
 * cairn-pi 扩展入口：只做工具/命令注册与 ctx 适配，业务逻辑全在 lib/。
 * 门禁在代码里，编排在技能里（见 DESIGN §3）。
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import {
  appendEvent,
  boardPath,
  dependents,
  findNode,
  loadBoard,
  loadConfig,
  nowIso,
  recreateBoard,
  refreshReady,
  saveBoard,
} from "../lib/board";
import type { CairnBoard, CairnConfig, EvidenceLevel } from "../lib/contracts";
import { parseBoard } from "../lib/contracts";
import { goalDone, nodeCoverage, renderPlan, renderReport, renderStatus } from "../lib/coverage";
import { canClaim, canMarkDone, checkBudget, checkTouches, requiredLevels } from "../lib/gates";
import { renderLevelCommand, runCommand, runLevels, validateEvidence } from "../lib/verify";
import { renderConventions } from "../lib/conventions";

interface Session {
  cwd: string;
  board: CairnBoard;
  cfg: CairnConfig;
}

function open(cwd: string): Session {
  return { cwd, board: loadBoard(cwd), cfg: loadConfig(cwd) };
}

function persist(session: Session): void {
  saveBoard(session.cwd, session.board);
}

function text(value: string, details: unknown = {}) {
  return { content: [{ type: "text" as const, text: value }], details };
}

function gateConfirmed(board: CairnBoard): boolean {
  return board.events.some((event) => event.kind === "gate" && event.detail["phase"] === "confirmed");
}

/** 跑 integrate 范围验收；reverifyModule 时复跑一次抓不稳定测试。 */
async function runIntegrate(session: Session, cwd: string): Promise<Record<string, EvidenceLevel>> {
  const levels: Record<string, EvidenceLevel> = {};
  const nodeLike = { tests: [] as string[], module: session.board.goal.id };
  const integrateLevels = requiredLevels(session.cfg, "integrate");
  for (const level of integrateLevels) {
    const cmd = renderLevelCommand(level, nodeLike);
    levels[level.id] = await runCommand({ cwd, cmd });
  }
  const first = integrateLevels[0];
  if (session.cfg.reverifyModule && first) {
    const again = await runCommand({ cwd, cmd: renderLevelCommand(first, nodeLike) });
    const original = levels[first.id];
    if (original && original.exit === 0 && again.exit !== 0) {
      levels[first.id] = {
        ...again,
        excerpt: `复跑不一致（首次 exit 0，复跑 ${again.exit}）\n${again.excerpt}`,
      };
    }
  }
  return levels;
}

function parseFlag(args: string, flag: string): string | undefined {
  const pattern = new RegExp(`--${flag}(?:\\s*=\\s*|\\s+)(?:"([^"]*)"|'([^']*)'|(\\S+))`, "i");
  const match = args.match(pattern);
  if (!match) return undefined;
  return match[1] ?? match[2] ?? match[3];
}

export default function (pi: ExtensionAPI): void {
  pi.registerTool({
    name: "cairn_board_read",
    label: "Cairn: 读黑板",
    description:
      "读取 cairn-pi 黑板（.cairn/board.json）：目标、节点状态机、覆盖矩阵。可只取单个节点。",
    parameters: Type.Object({
      nodeId: Type.Optional(Type.String({ description: "只读这个节点（含 requirement/acceptance/touches）" })),
      module: Type.Optional(Type.String({ description: "只列这个模块的节点" })),
      status: Type.Optional(Type.String({ description: "只列这个状态的节点：pending|ready|running|done|failed" })),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const session = open(ctx.cwd);
      if (params.nodeId) {
        const node = findNode(session.board, params.nodeId);
        if (!node) throw new Error(`节点不存在：${params.nodeId}`);
        return text(JSON.stringify(node, null, 2), node);
      }
      const visible = session.board.nodes.filter(
        (node) =>
          (params.module === undefined || node.module === params.module) &&
          (params.status === undefined || node.status === params.status),
      );
      return text(renderStatus(session.board, session.cfg), {
        goal: session.board.goal,
        coverage: nodeCoverage(session.board, session.cfg).filter((item) =>
          visible.some((node) => node.id === item.id),
        ),
        nodes: visible.map((node) => ({
          id: node.id,
          title: node.title,
          module: node.module,
          deps: node.deps,
          status: node.status,
          touches: node.touches,
          provides: node.provides,
        })),
        hints: session.board.hints,
      });
    },
  });

  pi.registerTool({
    name: "cairn_node_claim",
    label: "Cairn: 认领节点",
    description:
      "认领一个可执行节点。依赖未完成、已在运行、或预算耗尽都会被拒绝——这些门禁不可绕过。",
    parameters: Type.Object({
      nodeId: Type.String({ description: "节点 id，例如 n03" }),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const session = open(ctx.cwd);
      refreshReady(session.board);
      const budget = checkBudget(session.board, session.cfg);
      if (!budget.ok) throw new Error(budget.reason);
      const gate = canClaim(session.board, params.nodeId);
      if (!gate.ok) throw new Error(gate.reason);

      const node = findNode(session.board, params.nodeId)!;
      node.status = "running";
      node.attempts += 1;
      appendEvent(session.board, { kind: "claim", nodeId: node.id, detail: { attempts: node.attempts } });
      persist(session);
      // 一次返回完整节点切片 + 工程约定，省掉后续一次 cairn_board_read 往返。
      const context = [
        `已认领 ${node.id}（第 ${node.attempts} 次尝试）。`,
        `需求：${node.requirement}`,
        `验收判据：${node.acceptance.join("；")}`,
        `测试文件：${node.tests.length ? node.tests.join(" ") : "（无，acceptance 级会判 fail）"}`,
        `规格探针：${node.probes.length ? node.probes.join(" ") : "（无，probe 级会判 fail）"}`,
        `写入边界：${node.touches.join(", ")}`,
        node.consumes.length ? `依赖接口（用这些签名）：${node.consumes.join("；")}` : "",
        node.provides.length ? `本节点要提供：${node.provides.join("；")}` : "",
        "",
        renderConventions(session.board.survey.conventions),
      ]
        .filter((line) => line !== undefined)
        .join("\n");
      return text(context, {
        nodeId: node.id,
        attempts: node.attempts,
        touches: node.touches,
        requirement: node.requirement,
        acceptance: node.acceptance,
        tests: node.tests,
        probes: node.probes,
        consumes: node.consumes,
        provides: node.provides,
        conventions: session.board.survey.conventions,
      });
    },
  });

  pi.registerTool({
    name: "cairn_node_submit",
    label: "Cairn: 提交节点产出",
    description:
      "提交节点产出（候选事实 + 改动文件）。改动超出 touches 会被拒绝。提交后仍需 cairn_node_verify。",
    parameters: Type.Object({
      nodeId: Type.String(),
      claim: Type.String({ description: "客观陈述：这个节点产出了什么" }),
      changedFiles: Type.Array(Type.String(), { description: "实际改动的文件路径" }),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const session = open(ctx.cwd);
      const node = findNode(session.board, params.nodeId);
      if (!node) throw new Error(`节点不存在：${params.nodeId}`);
      if (node.status !== "running") throw new Error(`${node.id} 未认领（当前 ${node.status}）`);

      const boundary = checkTouches(node, params.changedFiles);
      if (!boundary.ok) {
        throw new Error(`改动越界：${boundary.violations.join(", ")} 不在 ${node.touches.join(", ")} 内`);
      }

      node.findings.push({
        claim: params.claim,
        status: "candidate",
        evidence: { levels: {}, verifiedBy: "pending", at: nowIso() },
      });
      appendEvent(session.board, {
        kind: "submit",
        nodeId: node.id,
        detail: { changedFiles: params.changedFiles },
      });
      persist(session);
      return text(`已记录候选产出（${node.id}）。下一步：cairn_node_verify。`, {
        nodeId: node.id,
        changedFiles: params.changedFiles,
      });
    },
  });

  pi.registerTool({
    name: "cairn_node_verify",
    label: "Cairn: 验收节点",
    description:
      "验收一个节点。run=true 时由扩展自己执行验收命令（权威）；也可提交独立 verify subagent 采到的证据（会做命令一致性 + 形状校验 + module 级复跑）。",
    parameters: Type.Object({
      nodeId: Type.String(),
      run: Type.Optional(Type.Boolean({ description: "true = 扩展自己执行命令（推荐）" })),
      levels: Type.Optional(
        Type.Record(
          Type.String(),
          Type.Object({ cmd: Type.String(), exit: Type.Number(), excerpt: Type.String() }),
        ),
      ),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const session = open(ctx.cwd);
      const node = findNode(session.board, params.nodeId);
      if (!node) throw new Error(`节点不存在：${params.nodeId}`);
      if (node.status !== "running") throw new Error(`${node.id} 未认领（当前 ${node.status}）`);

      const candidate = [...node.findings].reverse().find((item) => item.status === "candidate");
      if (!candidate) throw new Error(`${node.id} 还没有候选产出，先 cairn_node_submit`);

      const expected: Record<string, string> = {};
      for (const level of requiredLevels(session.cfg, "node")) {
        expected[level.id] = renderLevelCommand(level, node);
      }

      let levels: Record<string, EvidenceLevel>;
      if (params.run) {
        const result = await runLevels({ cwd: session.cwd, node, cfg: session.cfg, scope: "node" });
        levels = result.levels;
      } else {
        levels = (params.levels ?? {}) as Record<string, EvidenceLevel>;
        const verdict = validateEvidence({ levels, cfg: session.cfg, expected, scope: "node" });
        if (!verdict.ok) throw new Error(`证据复核不通过：${verdict.reason}`);
      }

      const covered = Object.entries(expected).every(([levelId]) => levels[levelId]?.exit === 0);
      candidate.evidence = { levels, verifiedBy: "cairn_node_verify", at: nowIso() };
      candidate.status = covered ? "confirmed" : "refuted";

      if (covered && canMarkDone(node, session.cfg).ok) {
        node.status = "done";
        appendEvent(session.board, { kind: "verify", nodeId: node.id, detail: { verdict: "pass" } });
      } else {
        node.status = "failed";
        appendEvent(session.board, {
          kind: "verify",
          nodeId: node.id,
          detail: { verdict: "fail", failures: Object.keys(expected).filter((id) => levels[id]?.exit !== 0) },
        });
      }
      persist(session);

      const summary = Object.entries(levels)
        .map(([id, evidence]) => `${id}: exit ${evidence.exit}`)
        .join("  ");
      const allDone =
        node.status === "done" && session.board.nodes.every((item) => item.status === "done");
      const message =
        `${node.id} → ${node.status}（${summary || "无证据"}）` +
        (allDone
          ? "\n→ 全部节点已完成。立即 /cairn integrate，然后 /cairn report，然后停止，不要再调用其它工具。"
          : "");
      return text(message, {
        nodeId: node.id,
        status: node.status,
        levels,
      });
    },
  });

  pi.registerTool({
    name: "cairn_node_fail",
    label: "Cairn: 标记节点失败",
    description: "把节点标记为失败并记录原因。达到 maxAttempts 后需进入子图重规划。",
    parameters: Type.Object({
      nodeId: Type.String(),
      reason: Type.String(),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const session = open(ctx.cwd);
      const node = findNode(session.board, params.nodeId);
      if (!node) throw new Error(`节点不存在：${params.nodeId}`);
      if (node.status !== "running") throw new Error(`${node.id} 未认领（当前 ${node.status}）`);

      node.status = "failed";
      session.board.hints.push({
        id: `h-${node.id}-${Date.now()}`,
        content: `${node.id} 失败：${params.reason}`,
        at: nowIso(),
      });
      appendEvent(session.board, { kind: "fail", nodeId: node.id, detail: { reason: params.reason } });
      persist(session);

      const needsReplan = node.attempts >= session.cfg.maxAttempts;
      return text(
        `${node.id} → failed（第 ${node.attempts}/${session.cfg.maxAttempts} 次）。${
          needsReplan ? "已达上限，需子图重规划。" : "可重试。"
        }`,
        { nodeId: node.id, attempts: node.attempts, needsReplan },
      );
    },
  });

  pi.registerTool({
    name: "cairn_coverage",
    label: "Cairn: 覆盖矩阵",
    description: "派生覆盖矩阵：每个节点的验收级别状态与目标是否达成。",
    parameters: Type.Object({}),
    async execute(_id, _params, _signal, _onUpdate, ctx) {
      const session = open(ctx.cwd);
      const coverage = nodeCoverage(session.board, session.cfg);
      return text(renderStatus(session.board, session.cfg), {
        goalDone: goalDone(session.board, session.cfg),
        coverage,
      });
    },
  });

  pi.registerTool({
    name: "cairn_integrate",
    label: "Cairn: 整体验收",
    description: "跑 integrate 范围的验收级别（模块级整体逻辑测试），结果写入黑板。",
    parameters: Type.Object({}),
    async execute(_id, _params, _signal, _onUpdate, ctx) {
      const session = open(ctx.cwd);
      const levels = await runIntegrate(session, session.cwd);
      session.board.integrate = { levels, verifiedBy: "cairn_integrate", at: nowIso() };
      appendEvent(session.board, {
        kind: "verify",
        nodeId: null,
        detail: { scope: "integrate", levels: Object.keys(levels) },
      });
      persist(session);

      const summary = Object.entries(levels)
        .map(([id, evidence]) => `${id}: exit ${evidence.exit}`)
        .join("  ");
      const done = goalDone(session.board, session.cfg);
      return text(
        `${summary || "无可运行的整体验收级别"}\n目标 ${session.board.goal.id}：${
          done ? "已达成" : "未达成"
        }` + (done ? "\n→ 流程完成。输出 cairn_report 追溯矩阵后立即停止。" : ""),
        { levels, goalDone: done },
      );
    },
  });

  pi.registerTool({
    name: "cairn_report",
    label: "Cairn: 追溯矩阵",
    description: "导出追溯矩阵：节点 ↔ 验收级别 ↔ 证据，并列出未验证项。",
    parameters: Type.Object({}),
    async execute(_id, _params, _signal, _onUpdate, ctx) {
      const session = open(ctx.cwd);
      return text(renderReport(session.board, session.cfg), {
        goalDone: goalDone(session.board, session.cfg),
      });
    },
  });

  pi.registerTool({
    name: "cairn_map_write",
    label: "Cairn: 写入节点图",
    description:
      "写入架构与节点 DAG（覆盖现有节点）。写入前会按 board 契约校验；不通过就拒绝。写完停在闸门。",
    parameters: Type.Object({
      modules: Type.Array(
        Type.Object({
          name: Type.String(),
          responsibility: Type.String(),
          dependsOn: Type.Array(Type.String()),
        }),
      ),
      nodes: Type.Array(
        Type.Object({
          id: Type.String(),
          module: Type.String(),
          title: Type.String(),
          requirement: Type.String(),
          deps: Type.Array(Type.String()),
          touches: Type.Array(Type.String()),
          provides: Type.Array(Type.String()),
          consumes: Type.Array(Type.String()),
          acceptance: Type.Array(Type.String()),
          tests: Type.Array(Type.String()),
          probes: Type.Optional(
            Type.Array(Type.String(), {
              description: "规格探针文件：从 requirement 逐条推导的边界断言（与 tests 分开，不能改给定测试）",
            }),
          ),
        }),
      ),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const session = open(ctx.cwd);
      const candidate = {
        ...session.board,
        architecture: { modules: params.modules, boundaries: session.board.architecture.boundaries },
        nodes: params.nodes.map((node) => ({
          ...node,
          probes: node.probes ?? [],
          status: "pending",
          attempts: 0,
          findings: [],
        })),
        integrate: null,
      };

      let validated: CairnBoard;
      try {
        validated = parseBoard(candidate);
      } catch (error) {
        throw new Error(`节点图不合法：${(error as Error).message}`);
      }

      refreshReady(validated);
      appendEvent(validated, {
        kind: "gate",
        nodeId: null,
        detail: { phase: "map_ready", nodes: validated.nodes.length },
      });
      saveBoard(ctx.cwd, validated);

      return text(renderStatus(validated, session.cfg), {
        nodes: validated.nodes.length,
        ready: validated.nodes.filter((node) => node.status === "ready").map((node) => node.id),
      });
    },
  });

  pi.registerTool({
    name: "cairn_hint",
    label: "Cairn: 注入提示",
    description: "追加一条人工判断，后续阶段读取时会被吸收。",
    parameters: Type.Object({ content: Type.String() }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const session = open(ctx.cwd);
      session.board.hints.push({ id: `h-${Date.now()}`, content: params.content, at: nowIso() });
      persist(session);
      return text(`已注入提示（共 ${session.board.hints.length} 条）。`, { hints: session.board.hints.length });
    },
  });

  const notify = (ctx: ExtensionCommandContext, message: string) => {
    if (ctx.hasUI) ctx.ui.notify(message, "info");
    else process.stdout.write(`${message}\n`);
  };

  pi.registerCommand("cairn", {
    description: "机器人黑板工作流：init | map | execute | integrate | resume | status | report",
    handler: async (args, ctx) => {
      const sub = (args.trim().split(/\s+/)[0] ?? "status").toLowerCase();

      if (sub === "init") {
        const goal = parseFlag(args, "goal");
        if (!goal) {
          notify(ctx, '用法：/cairn init --goal "要达到的结果" [--acceptance "判据"] [--origin "起点"]');
          return;
        }
        const board = recreateBoard({
          goal,
          goalAcceptance: parseFlag(args, "acceptance") ?? goal,
          origin: parseFlag(args, "origin"),
        });
        saveBoard(ctx.cwd, board);
        notify(ctx, `黑板已建立：${boardPath(ctx.cwd)}\n目标：${goal}\n下一步：/cairn map`);
        return;
      }

      if (sub === "map") {
        const session = open(ctx.cwd);

        if (args.includes("--verify-only")) {
          appendEvent(session.board, { kind: "gate", nodeId: null, detail: { phase: "verify_only" } });
          persist(session);
          notify(ctx, "已切到只验收模式：跳过节点图，直接 /cairn integrate。");
          return;
        }

        const replanTarget = parseFlag(args, "replan");
        if (replanTarget) {
          const node = findNode(session.board, replanTarget);
          if (!node) {
            notify(ctx, `节点不存在：${replanTarget}`);
            return;
          }
          const scope = [node.id, ...dependents(session.board, node.id).map((item) => item.id)];
          appendEvent(session.board, {
            kind: "replan",
            nodeId: node.id,
            detail: { scope },
          });
          persist(session);
          notify(
            ctx,
            `重规划范围：${scope.join(", ")}（已完成节点的证据保留，不重置）。\n加载技能 cairn-map 的「重规划模式」改完再 cairn_map_write。`,
          );
          return;
        }

        if (session.board.nodes.length === 0) {
          notify(ctx, "地图为空。加载技能 cairn-map 生成架构与节点图。");
          return;
        }
        appendEvent(session.board, { kind: "gate", nodeId: null, detail: { phase: "map_ready" } });
        persist(session);
        notify(ctx, `${renderPlan(session.board)}\n\n闸门：确认后执行 /cairn execute`);
        return;
      }

      if (sub === "execute") {
        const session = open(ctx.cwd);
        if (session.board.nodes.length === 0) {
          notify(ctx, "地图为空，先 /cairn map");
          return;
        }
        if (!gateConfirmed(session.board)) {
          const yes = args.includes("--yes");
          const approved = yes || (ctx.hasUI && (await ctx.ui.confirm("确认按此节点图执行？", "门禁：未确认前不改任何代码")));
          if (!approved) {
            notify(ctx, "未确认，停在闸门。检查 /cairn status --plan 后再决定。");
            return;
          }
          appendEvent(session.board, { kind: "gate", nodeId: null, detail: { phase: "confirmed" } });
          persist(session);
        }
        notify(ctx, "闸门已通过。加载技能 cairn-execute 逐节点推进（每个节点一个 subagent）。");
        return;
      }

      if (sub === "integrate") {
        const session = open(ctx.cwd);
        const levels = await runIntegrate(session, ctx.cwd);
        session.board.integrate = { levels, verifiedBy: "cairn.integrate", at: nowIso() };
        appendEvent(session.board, { kind: "verify", nodeId: null, detail: { scope: "integrate" } });
        persist(session);
        notify(ctx, renderStatus(session.board, session.cfg));
        return;
      }

      if (sub === "status") {
        const session = open(ctx.cwd);
        notify(ctx, args.includes("--plan") ? renderPlan(session.board) : renderStatus(session.board, session.cfg));
        return;
      }

      if (sub === "report") {
        const session = open(ctx.cwd);
        notify(ctx, renderReport(session.board, session.cfg));
        return;
      }

      if (sub === "resume") {
        const session = open(ctx.cwd);
        let recovered = 0;
        for (const node of session.board.nodes) {
          if (node.status === "running") {
            node.status = "ready";
            recovered += 1;
          }
        }
        if (recovered > 0) {
          appendEvent(session.board, { kind: "replan", nodeId: null, detail: { phase: "resume", recovered } });
          persist(session);
        }
        const ready = session.board.nodes.filter((node) => node.status === "ready").map((node) => node.id);
        const done = session.board.nodes.filter((node) => node.status === "done").length;
        notify(
          ctx,
          `${renderStatus(session.board, session.cfg)}\n\n` +
            `中断恢复：${done} 个已完成，${recovered} 个 running 已重置为 ready。\n` +
            (ready.length
              ? `下一步：/cairn execute 继续（就绪节点：${ready.join(", ")}）。`
              : "无就绪节点：要么全部完成，要么有依赖未满足。"),
        );
        return;
      }

      notify(ctx, "未知子命令。可用：init | map | execute | integrate | resume | status | report");
    },
  });
}
