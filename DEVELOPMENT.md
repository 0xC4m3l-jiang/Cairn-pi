# cairn-pi 开发文档

面向在这个包上继续写代码的人。设计依据见 [`DESIGN.md`](DESIGN.md)，文档不重复设计理由。

## 1. 开工前

1. 加载技能 `dev-loop`，读本地的 `.pi/devloop.md`（**不入库**；没有就按 `AGENTS.md` 的表自建）
2. 判断改动分级（S / M / L），按该档的必做项走
3. 给出范围声明：**要改** / **不改** / **不动但已注意到**
4. 写变更包 `docs/plans/YYYY-MM-DD-<主题>.md`，完成后追加 `docs/Log.md`

**入口契约优先**：`lib/contracts.ts` 里的类型是所有模块的公共语言。改类型前先改这里并跑测试。

## 2. 环境与命令

```bash
npm install          # 装 devDependencies（宿主包走 peerDependencies）
npm run typecheck    # tsc --noEmit
npm test             # vitest run
npm run verify       # typecheck + test（一键验证 = .pi/devloop.md 的 verify_cmd）
```

本地挂载到 pi 试跑：

```bash
pi -e .
```

`npm run verify` 必须绿。红了不许跳过、不许注释检查。

## 3. 目录与模块职责

```text
extensions/cairn.ts     扩展入口。注册工具与命令，绑定 ctx。不含业务逻辑。
lib/contracts.ts        board.json / config.json 的类型与校验。无副作用。
lib/board.ts            读写 board.json；节点查找；依赖派生；事件追加。
lib/gates.ts            三道门（依赖/边界/证据）的纯判定函数。
lib/verify.ts           渲染验收命令；跑命令取退出码与输出片段；module 级复跑。
lib/conventions.ts      工程约定文本（注入节点 brief）：Map/副本/无 this/事件顺序/边界枚举。
lib/coverage.ts         覆盖派生（节点状态、目标状态、追溯矩阵数据）。
skills/cairn-map/       阶段 ①survey ②map ③闸门 的模型侧方法。
skills/cairn-execute/   阶段 ④skeleton ⑤execute 的模型侧方法。
skills/cairn-integrate/ 阶段 ⑥ 的模型侧方法。
tests/                  vitest 单测 + fixtures。
```

### 依赖方向（单向，禁止回指）

```text
contracts  ← board  ← gates
                ↑       ↑
            coverage  verify
                ↑       ↑
             extensions/cairn.ts（薄壳）
```

规则：

- `contracts` 不 import 其它 lib
- `gates` / `coverage` / `verify` 不互相 import
- `extensions/cairn.ts` 不实现业务逻辑，只做注册与 ctx 适配
- 任何 lib **不得 import pi 的运行时**（保证脱离 pi 可单测）

## 4. 模块接口契约

签名是契约，改签名 = L 档改动。

### 4.1 `lib/contracts.ts`

```typescript
export type NodeStatus = "pending" | "ready" | "running" | "done" | "failed";
export type FindingStatus = "candidate" | "confirmed" | "refuted";

export interface EvidenceLevel { cmd: string; exit: number; excerpt: string }
export interface Finding {
  claim: string;
  status: FindingStatus;
  evidence: { levels: Record<string, EvidenceLevel>; verifiedBy: string; at: string };
}
export interface CairnNode {
  id: string; module: string; title: string; requirement: string;
  deps: string[]; touches: string[]; provides: string[]; consumes: string[];
  acceptance: string[]; tests: string[]; probes: string[];
  status: NodeStatus; attempts: number; findings: Finding[];
}
export interface CairnBoard {
  version: 1;
  goal: { id: string; claim: string; acceptance: string };
  survey: { modules: string[]; conventions: string[]; testCmd: string };
  architecture: { modules: unknown[]; boundaries: unknown[] };
  nodes: CairnNode[];
  hints: { id: string; content: string; at: string }[];
  events: CairnEvent[];
}
export interface LevelConfig {
  id: string; required: boolean; how: string; scope: "node" | "integrate";
}
export interface CairnConfig {
  levels: LevelConfig[]; maxAttempts: number;
  reverifyModule: boolean; maxReplansPerModule: number;
}

export function parseBoard(raw: unknown): CairnBoard;   // 校验失败抛错
export function parseConfig(raw: unknown): CairnConfig;
```

### 4.2 `lib/board.ts`

```typescript
export function boardPath(cwd: string): string;
export function loadBoard(cwd: string): CairnBoard;
export function saveBoard(cwd: string, board: CairnBoard): void;   // 原子写
export function appendEvent(board: CairnBoard, e: Omit<CairnEvent, "at">): void;
export function findNode(board: CairnBoard, id: string): CairnNode | undefined;
export function dependents(board: CairnBoard, id: string): CairnNode[];   // 传递闭包
export function refreshReady(board: CairnBoard): void;                    // pending→ready
```

### 4.3 `lib/gates.ts`（纯函数，测试重点）

```typescript
export function canClaim(board: CairnBoard, id: string): { ok: true } | { ok: false; blockedBy: string[] };
export function checkTouches(node: CairnNode, changed: string[]): { ok: true } | { ok: false; violations: string[] };
export function missingLevels(node: CairnNode, cfg: CairnConfig, scope: "node" | "integrate"): string[];
export function canMarkDone(node: CairnNode, cfg: CairnConfig): { ok: true } | { ok: false; missing: string[] };
```

### 4.4 `lib/verify.ts`

```typescript
// 占位符集合三个：{tests} → node.tests 空格连接；{module} → node.module；{probes} → node.probes 空格连接
export function renderLevelCommand(level: LevelConfig, node: CairnNode): string;
export function runCommand(cwd: string, cmd: string, timeoutMs: number): Promise<EvidenceLevel>;
export function recheckModule(cwd: string, cfg: CairnConfig, cmd: string): Promise<{ ok: boolean; evidence: EvidenceLevel }>;
export function validateEvidence(
  levels: Record<string, EvidenceLevel>, cfg: CairnConfig,
  expected: Record<string, string>,           // levelId → 期望命令
): { ok: true } | { ok: false; reason: string };
```

`validateEvidence` 实现 DESIGN §8.2 的第 1、2 层复核；第 3 层由 `recheckModule` 完成。

### 4.5 `lib/coverage.ts`

```typescript
export interface NodeCoverage {
  id: string; title: string; status: NodeStatus;
  levels: Record<string, "pass" | "fail" | "missing">;
}
export function nodeCoverage(board: CairnBoard, cfg: CairnConfig): NodeCoverage[];
export function goalDone(board: CairnBoard, cfg: CairnConfig): boolean;
export function traceMatrix(board: CairnBoard, cfg: CairnConfig): TraceRow[];
export function renderStatus(board: CairnBoard, cfg: CairnConfig): string;
```

### 4.6 `extensions/cairn.ts`

```typescript
export default function (pi: ExtensionAPI) {
  // 只做：registerTool × 10、registerCommand × 7、session_start 时加载 board
  // 长资源（文件监听/定时器）必须在 session_start 里起，session_shutdown 里清
}
```

## 5. 开发顺序（每个里程碑可独立验证）

| 里程碑 | 内容 | 验证方式 | 前置 |
|---|---|---|---|
| **M0** | `package.json` + tsconfig + `contracts.ts` + vitest 跑通 | `npm run verify` 绿 | —— |
| **M1** | `board.ts`：读写、原子写、依赖派生 | 单测：读写往返、`dependents` 传递闭包 | M0 |
| **M2** | `gates.ts`：三道门 + 预算门 | 单测：每道门的通过/拒绝各 1 例；预算超限判定 1 例 | M1 |
| **M3** | `coverage.ts`：覆盖派生 + status 渲染 | 单测：三态渲染 + 目标完成判定 | M2 |
| **M4** | `verify.ts`：跑命令 + 两层复核 | 单测：命令不一致、缺级、退出码类型错各 1 例 | M2 |
| **M5** | `extensions/cairn.ts`：10 工具 + 7 命令 | 前置：把 `extensions/**` 纳入 `tsconfig.include` 并解决宿主包类型（本地安装 `@earendil-works/pi-coding-agent` 或加类型 shim）；验证含 `npm run typecheck` + 手动 `/cairn init` → `/cairn status` | M3、M4 |
| **M6** | `skills/cairn-map`：survey + map + 闸门 | 冒烟：小仓库出 board.json，闸门停住 | M5 |
| **M7** | `skills/cairn-execute` + `cairn-integrate` | 冒烟：跑通一个 2 节点需求 | M6 |

**M0–M4 不需要启动 pi**，这是刻意的：把 90% 的逻辑放在可单测的纯函数里。
M5 之后才碰扩展运行时。

### 已完成状态（2026-10-31）

| 里程碑 | 状态 | 证据 |
|---|---|---|
| M0 contracts | ✅ | `tests/contracts.test.ts` 17 例 |
| M1 board | ✅ | `tests/board.test.ts` 10 例 |
| M2 gates | ✅ | `tests/gates.test.ts` 15 例 |
| M3 coverage | ✅ | `tests/coverage.test.ts` 11 例 |
| M4 verify | ✅ | `tests/verify.test.ts` 13 例 |
| M5 扩展（10 工具 + 7 子命令） | ✅ | `tests/extension.test.ts` 10 例（含完整流水线 + 中断恢复） |
| M6/M7 技能 | ✅ | `skills/cairn-map` / `cairn-execute` / `cairn-integrate` |

`extensions/**` 已纳入 `tsconfig.include`，扩展代码同样过 `tsc --noEmit`。

## 6. 测试策略

### 6.1 纯函数单测（主力）

`tests/fixtures/` 放样本 board：

```text
tests/fixtures/
├── board-minimal.json      # 2 节点，无依赖
├── board-chain.json        # n01→n02→n03 链
├── board-diamond.json      # 菱形依赖
├── board-refuted.json      # 含 refuted finding
└── config-standard.json    # 三级阶梯
```

必测清单（对齐 DESIGN §6、§8）：

1. `canClaim` 在依赖未 done 时拒绝，并列出 blockedBy
2. `checkTouches` 拒绝列表外路径
3. `canMarkDone` 在缺 `acceptance` 级证据时拒绝
4. `validateEvidence` 拒绝与配置不一致的命令
5. `validateEvidence` 拒绝非整数 `exit`、空 `excerpt`
6. `nodeCoverage` 三态（pass / fail / missing）
7. `goalDone` 在任一节点未 done 时为 false
8. `refreshReady` 只把 deps 全 done 的节点置 ready
9. `dependents` 返回传递闭包（重规划范围）
10. `parseBoard` 拒绝缺 `touches` 的节点
11. `parseBoard` 拒绝 `module` 未在 `architecture.modules` 声明
12. `parseBoard` 拒绝未知 `event.kind`（审计流不可写任意值）
13. `parseConfig` 预算默认值 + 非正整数拒绝

### 6.2 切片校验（防退化）

断言节点 prompt 的构造结果**只含允许字段**：

```typescript
const prompt = buildNodePrompt(node, upstreamSignatures, conventions);
expect(prompt).not.toContain("整体计划");
expect(prompt).not.toContain(otherNode.requirement);
expect(prompt).toContain(node.requirement);
```

这条测试是 DESIGN §7 的执行保障——切片错了，整套设计的收益就没了。

### 6.3 冒烟（M6+）

临时 git 仓库，一个 trivial 目标（如「补一个 `add(a,b)` 并让测试过」），跑完整流水线。
检查三件事：闸门确实停住、越界写入被拒、缺证据被拒。

### 6.4 不测什么

不测模型输出的内容质量（不可复现）；不测真 subagent 的推理。只测**门禁与派生**。

## 7. 编码规范

- TypeScript strict；不用 `any`，外部输入一律 `unknown` + 校验
- 纯函数优先；I/O 集中在 `board.ts` / `verify.ts`
- 不引入运行时依赖（宿主已提供 `typebox`；其余手写）
- 错误信息必须含「哪个节点 / 哪个字段 / 为什么」
- 文件路径一律项目相对，避免 `@scope` 与裸目录名（会让检查工具误判为路径）

## 8. 提交与发布

```bash
npm run verify           # 必须绿
git add -A && git commit # 提交信息：<档位>: <一句话>（如 `M2: 加三道门禁`）
```

发布前检查：

1. `package.json` 的 `peerDependencies` 含宿主包（`@earendil-works/pi-coding-agent`、`typebox` 等），且**不在** `dependencies` 里
2. `files` 字段收敛（`extensions`、`lib`、`skills`、`docs`、`README.md`、`DESIGN.md`）
3. `keywords` 含 `pi-package`
4. README 的安装命令与实际包名一致

## 9. 常见坑

| 坑 | 后果 | 做法 |
|---|---|---|
| 在扩展 factory 里起长资源 | 某些调用不启动会话却加载扩展，资源泄漏 | 放到 `session_start`，`session_shutdown` 清理 |
| 把宿主包写进 `dependencies` | 装出重复实例，类与注册表分裂 | 只写 `peerDependencies: "*"` |
| `touches` 用通配符 `src/**` | 边界门形同虚设 | 必须列具体文件 |
| 证据里信任模型上报的 `exit` | 自证问题回归 | 只认 `runCommand` 实测值 |
| board 非原子写 | 中断留下半个 JSON | 写临时文件 + rename |
| 继承的 `PI_PACKAGE_DIR` 指向残缺目录（如已卸载的 VSCode 扩展） | `pi -e` 启动即崩：`ENOENT …theme/dark.json` | 该变量属宿主安装，不是本包问题；在干净环境运行或先 `unset PI_PACKAGE_DIR` |
| 节点切太细 | `touches` 重叠，无法独立验收 | 遵守 DESIGN §5.2 四条标准 |

## 10. 相关文档

| 文档 | 用途 |
|---|---|
| [`DESIGN.md`](DESIGN.md) | 设计定稿：数据模型、状态机、切片、验收 |
| [`docs/cairn-architecture.md`](docs/cairn-architecture.md) | Cairn 架构提取（设计来源） |
| [`docs/cairn-core-dispatch.md`](docs/cairn-core-dispatch.md) | Cairn dispatch 实现细节 |
| [`AGENTS.md`](AGENTS.md) | 项目开发规范（dev-loop 实例化） |
