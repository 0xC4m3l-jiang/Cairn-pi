# cairn-pi 设计文档

> 状态：已确认（决策经用户逐项确认）
> 关联：[`DEVELOPMENT.md`](DEVELOPMENT.md) · [`docs/cairn-architecture.md`](docs/cairn-architecture.md)

## 1. 定位

**它是**：把一条多模块开发需求切成可独立验收的节点，逐节点用独立上下文的 subagent 实现，
再用组 Agent 拼接、按验收阶梯整体验证的工作流包。

**它不是**：通用编程助手、代码生成器、CI 系统、Cairn 的复刻。

### 1.1 与 Cairn 的关系

| | Cairn（纯搜索） | cairn-pi（plan-first + 黑板） |
|---|---|---|
| 图从哪来 | 搜索中生长（起点只有 origin + goal） | **先规划成 DAG，再执行** |
| 适合 | 路径完全未知（渗透 / CTF / 证明） | 路径大体可知、可分解（开发需求） |
| 进度可见性 | 差 | 好（节点状态机） |
| 可并行 | 难（图状态耦合） | 易（节点依赖解耦） |
| 计划错了 | 自适应纠正 | **会一路错下去** → 必须补重规划回路（§9） |

Cairn 的**架构**（黑板、事实-意图、确定性调度、结构化契约、上下文隔离）被沿用；
它的**规模产物**（容器、租约、心跳、多 dispatcher）全部不迁移。

## 2. 已锁决策

| # | 决策点 | 结论 | 来源 |
|---|---|---|---|
| D1 | 形态 | pi 包 = 扩展（状态机+门禁）+ 技能（编排方法）+ 原生 subagent（执行） | 用户确认 |
| D2 | 节点粒度 | 模块内的**职责单元**（四条硬标准见 §5.2） | 用户确认 |
| D3 | 节点执行 | **v1 串行**；验证切片质量后再开 worktree 并行 | 用户确认 |
| D4 | 建图后 | **人工确认**才进入骨架与执行 | 用户确认 |
| D5 | 验收执行者 | **独立 verify subagent** 跑 + 扩展三层复核 | 用户确认 |
| D6 | 黑板存储 | 项目根 `.cairn/board.json` | 设计选择 |
| D7 | 验收阶梯 | `unit` → `acceptance`（节点）/ `module`（整体） | 设计选择 |

## 3. 架构分层

```text
┌─────────────────────────────────────────────────────────┐
│ 技能层（模型判断「怎么分析、怎么写」）                    │
│   cairn-map  ·  cairn-execute  ·  cairn-integrate        │
├─────────────────────────────────────────────────────────┤
│ 扩展层（确定性，不可作弊）                                │
│   状态机迁移 · 依赖门 · 边界门 · 证据门 · 覆盖派生 · 复核  │
├─────────────────────────────────────────────────────────┤
│ 执行层（原生 subagent，上下文隔离）                       │
│   节点实现者  ·  独立验证者  ·  组 Agent                  │
└─────────────────────────────────────────────────────────┘
```

**为什么这样分**：状态与判定必须不可作弊（代码）；方法与创造必须灵活（模型）；
执行必须隔离（独立 subagent 进程/会话）。

pi 的 `subagent` 工具是 model-only，扩展调不到它。所以**扩展管状态、主代理派 subagent**：
门禁在代码里，编排在模型里。

## 4. 流水线

```text
①survey     只读：需求 + 原始代码 → 模块结构 / 依赖 / 约定 / 现有测试
②map        架构 + 骨架方案 + 节点 DAG  →  .cairn/board.json + PLAN.md
③闸门       人工确认（--yes 仅对 <3 节点且不触及数据模型/对外接口生效）
④skeleton   落地目录与接口桩；编译/lint 必须通过
⑤execute    逐节点：subagent 实现 → 独立 verify subagent 验收 → 状态推进
⑥integrate  组 Agent 拼接 + 模块级整体验收 → 追溯矩阵
```

| 阶段 | 驱动者 | 写权限 | 产出 |
|---|---|---|---|
| ①survey | `cairn-map` | 只读 | 分析笔记（进 board.survey） |
| ②map | `cairn-map` | 只写 `.cairn/` 与 `PLAN.md` | board.json + PLAN.md |
| ③闸门 | 扩展 | —— | 确认或打回 |
| ④skeleton | `cairn-execute` | 写骨架文件 | 可编译的空实现 |
| ⑤execute | `cairn-execute` | 节点 `touches` 范围内 | 节点产出 + 证据 |
| ⑥integrate | `cairn-integrate` | 全仓库（解冲突） | 合并结果 + 整体证据 |

### 4.1 闸门（③）

```text
地图就绪：4 模块 / 7 节点 / 3 个接口边界
  M1 auth   n01 db 封装 · n02 token 生成 · n03 token 校验
  M2 api    n04 登录端点
  M3 web    n05 回调页
验收阶梯：unit → acceptance（节点）/ module（整体）
确认执行：/cairn execute      仅看计划：/cairn status --plan
```

不确认 → **不改任何代码**。这是「先规格，后代码」的落地位置。

## 5. 数据模型

### 5.1 `.cairn/board.json`

```jsonc
{
  "version": 1,
  "goal":   { "id": "T0", "claim": "...", "acceptance": "..." },
  "survey": { "modules": [...], "conventions": [...], "testCmd": "npm test" },
  "architecture": { "modules": [{ "name": "auth", "responsibility": "认证与会话", "dependsOn": ["db"] }], "boundaries": [{ "from": "api", "to": "auth", "contract": "POST /login" }] },
  "nodes":  [ /* Node[] */ ],
  "hints":  [ { "id": "h001", "content": "...", "at": "..." } ],
  "events": [ { "at": "...", "kind": "claim|submit|verify|fail|replan|gate", "nodeId": "...", "detail": {} } ]
}
```

**`events` 是只追加的审计流**——每次状态迁移一条，不可改。它是 `/cairn report` 与事后复核的依据。

#### Node 字段字典

| 字段 | 类型 | 必填 | 含义 | 谁写 |
|---|---|---|---|---|
| `id` | string | ✔ | `n01` 形式，稳定不可改 | map |
| `module` | string | ✔ | 所属模块名，**必须已在 `architecture.modules` 声明**（`parseBoard` 强制） | map |
| `title` | string | ✔ | 一句动作描述 | map |
| `requirement` | string | ✔ | **只属于本节点**的需求切片 | map |
| `deps` | string[] | ✔ | 前置节点 id（空数组=起点） | map |
| `touches` | string[] | ✔ | 允许写/改的文件路径；越界即失败 | map |
| `provides` | string[] | ✔ | 对外接口签名（下游靠它开发） | map |
| `consumes` | string[] | ✔ | 依赖上游的接口签名 | map |
| `acceptance` | string[] | ✔ | 可判定真伪的验收判据 | map |
| `tests` | string[] | ✔ | 承载验收的测试文件；空数组=该级必 fail | map |
| `probes` | string[] | ✔ | **规格探针**：从 requirement 逐条推导、给定测试未覆盖的边界断言文件；空数组=probe 级必 fail | map |
| `status` | enum | ✔ | `pending` / `ready` / `running` / `done` / `failed` | 扩展 |
| `attempts` | number | ✔ | 失败次数 | 扩展 |
| `findings` | Finding[] | ✔ | 产出与证据 | 扩展 |

#### Finding 字段字典

| 字段 | 类型 | 含义 |
|---|---|---|
| `claim` | string | 客观陈述，不是主张 |
| `status` | `candidate` \| `confirmed` \| `refuted` | 只有 verify 能写后两者 |
| `evidence.levels` | `{ [levelId]: { cmd, exit, excerpt } }` | 每级原始证据 |
| `evidence.verifiedBy` | string | verify subagent 的标识 |
| `evidence.at` | ISO string | 时间 |

### 5.2 节点粒度：四条硬标准

不满足任一条，`map` 阶段必须再拆，不许硬塞。

1. **可独立验收** —— 有自己的 `acceptance`，能映射到具体测试用例
2. **单会话可完成** —— 预计改动 ≤ 200 行
3. **边界清楚** —— `touches` 不与其它节点重叠（并行阶段尤其关键）
4. **接口可声明** —— `provides` / `consumes` 能写成签名

### 5.3 `.cairn/config.json`

```jsonc
{
  "levels": [
    { "id": "unit",       "required": true, "how": "npm test -- {tests}",          "scope": "node" },
    { "id": "probe",      "required": true, "how": "node --test {probes}",         "scope": "node" },
    { "id": "module",     "required": true, "how": "npm run test:integration",     "scope": "integrate" }
  ],
  "maxAttempts": 2,
  "reverifyModule": true,
  "maxReplansPerModule": 2,
  "budget": { "maxTotalAttempts": 20, "maxWallClockMinutes": 60 }
}
```

模板占位符有三个：`{tests}` → 节点 `tests` 用空格连接；`{module}` → 节点所属模块；`{probes}` → 节点 `probes` 用空格连接。

**为什么要 `probe` 级**：给定测试只覆盖需求的一部分。需求里未写成测试的条款（如「未知 sku 返回 0」）如果只靠 `tests` 验收，一定会漏——而且因为证据链完整，漏了也看不出来。`probe` 级逼实现者把需求逐条落成断言。

`budget` 由扩展在每次 `cairn_node_claim` 时检查（累计 attempts + 墙上时间）。
超限时不报错、不抛异常，直接将流程置为 `BUDGET_EXHAUSTED` 并输出覆盖矩阵。

## 6. 状态机

```text
pending ──deps 全 done──> ready ──claim──> running ──verify pass──> done
                             ▲                  │
                             │                  └──verify fail──> failed
                             │                                     │
                             └────attempts < maxAttempts────────────┘
                                                                   │
                                          attempts >= maxAttempts ─┴──> replan（子图）
```

### 6.1 迁移门禁矩阵

| 迁移 | 门禁（扩展检查，非模型自述） | 拒绝时的行为 |
|---|---|---|
| `pending → ready` | 全部 `deps.status === "done"` | 返回阻塞的依赖列表 |
| `ready → running` | 该节点不在运行中 | 拒绝重复认领 |
| `running → done` | `findings` 中有一条 `confirmed`，且 `evidence.levels` 覆盖所有 `required && scope==="node"` 级别 | 列出缺失级别 |
| `running → failed` | verify 判 fail（任一级 fail 即 fail） | 保留各级证据 |
| `failed → ready` | `attempts < maxAttempts` | 转为 replan |

### 6.2 覆盖是派生量

任何任务**不允许**直接写「节点完成」或「需求完成」。状态由 findings 现算：

```text
nodeDone(n)   = ∃ f ∈ n.findings: f.status === "confirmed"
                ∧ f.evidence.levels ⊇ requiredNodeLevels(n)
goalDone      = 全部 node.status === "done" ∧ module 级 confirmed
```

## 7. 上下文切片

### 7.1 节点实现者（subagent）

| 给 | 不给 |
|---|---|
| 该节点 `requirement` / `acceptance` / `tests` / `touches` | 整体计划全文 |
| 依赖节点 `provides` 的**签名** | 依赖节点的实现细节、diff |
| 项目约定（`AGENTS.md` / 风格 / 构建命令） | 其它节点的对话历史 |
| 该模块一行定位 | 全局架构图全文 |
| 失败节点的失败级别与摘录（重试时） | 失败节点的完整排错过程 |

**理由**：节点逻辑正确性只依赖「需求 + 接口 + 约定」三样。多给任何一样都是噪声，
会让子代理倾向模仿而非独立推导——这正是「上下文独立保证节点逻辑准确」的机制。

### 7.2 独立验证者（verify subagent）

| 给 | 不给 |
|---|---|
| 节点 `claim` / `acceptance` / `tests` | 实现思路、节点对话 |
| 验收阶梯命令原文 | 组 Agent 的判断 |
| `touches` 文件（只读） | 其它节点的证据 |

工具集：`read,grep,find,ls,bash`——**无 write/edit**。
验证者若能顺手"修"掉问题，验证就退化成自证。

### 7.3 组 Agent（integrate）

| 给 | 不给 |
|---|---|
| 各节点产出摘要 + diff | 节点内部推理过程 |
| 接口契约表（`provides`/`consumes` 汇总） | 各节点的完整对话 |
| 整体验收命令 | —— |

给了推理过程，组 Agent 的上下文会被 N 个节点撑爆，直接退化成单发 agent。

## 8. 验收与防自证

### 8.1 独立验证者

- 逐级跑 `unit` / `acceptance`，返回**原始证据**：命令原文 + 退出码 + 输出片段
- 判 pass 但缺任一必需级证据 → 强制 fail

### 8.2 扩展三层复核（补「只信 subagent」的洞）

| # | 检查 | 不通过 |
|---|---|---|
| 1 | **命令一致性**：证据中的命令必须与 `config.levels[].how` 渲染结果一致 | 判 fail |
| 2 | **形状校验**：`exit` 为整数、`excerpt` 非空、必需级别齐全 | 判 fail |
| 3 | **关键级复跑**：`module` 级由扩展自己再跑一次并比对退出码（`reverifyModule`） | 判 fail |

既保住「独立验收者」的隔离，又不把最终判定权交给一个代理。

### 8.3 缺测试不放行

`tests` 为空 → `acceptance` 级无法执行 → 该级 fail。
不因"没写测试"而默认通过。

## 9. 重规划回路

```text
节点 failed 且 attempts >= maxAttempts
  → cairn-map 进入「子图重规划」模式
  → 只重规划该节点及其下游（保留已 done 节点与全部证据）
  → 同一模块连续重规划 ≥ maxReplansPerModule
  → NEEDS_HUMAN，把失败证据链写出，交人
```

无此回路，一个错误的架构决策会污染整条流水线。

## 10. 接口

### 10.1 扩展工具

| 工具 | 作用 | 拒绝条件 |
|---|---|---|
| `cairn_map_write` | 写入架构与节点 DAG（契约校验后落盘） | 模块未声明 / 依赖指向不存在节点 / `touches` 为空 |
| `cairn_board_read` | 读图（可只读单个节点） | —— |
| `cairn_node_claim` | 认领 ready 节点 | 依赖未 done / 已有 running / 预算耗尽 |
| `cairn_node_submit` | 提交候选产出 | `touches` 越界 / 节点未认领 |
| `cairn_node_verify` | 记录或执行节点验收并三层复核 | 命令不一致 / 形状非法 / 未认领 |
| `cairn_node_fail` | 标记失败并写 hint | 未认领 |
| `cairn_integrate` | 跑 integrate 范围验收 | —— |
| `cairn_coverage` | 派生覆盖矩阵 | —— |
| `cairn_report` | 导出追溯矩阵 | —— |
| `cairn_hint` | 注入人工判断 | —— |

### 10.2 命令

| 命令 | 作用 |
|---|---|
| `/cairn init --goal "..." [--requirements reqs.md]` | 建空板 + 声明目标 |
| `/cairn map [--replan <nodeId>] [--verify-only]` | 阶段①②；命中闸门 |
| `/cairn execute [--yes]` | 阶段④⑤ |
| `/cairn integrate` | 阶段⑥ |
| `/cairn resume` | 把中断遗留的 running 节点重置为 ready，继续执行 |
| `/cairn status [--plan]` | 状态机 + 覆盖矩阵 |
| `/cairn report` | 追溯矩阵 |

## 11. 失败路径与退出态

| 情况 | 处理 |
|---|---|
| subagent 超时 | 节点 `failed`，记 event，不写证据 |
| 输出非法 / 契约不通过 | 同上，保留 stdout 摘要 |
| verify 缺必需级证据却判 pass | 强制 fail |
| `touches` 越界写入 | 拒绝提交，节点保持 `running` |
| 节点连续失败达上限 | 子图重规划 |
| 同模块重规划超限 | `NEEDS_HUMAN` |
| 无 ready 节点且有依赖环 | `STUCK` |
| 预算耗尽 | `BUDGET_EXHAUSTED`，输出覆盖矩阵 |

四个退出态（`DONE` / `NEEDS_HUMAN` / `STUCK` / `BUDGET_EXHAUSTED`）都必须能说清「为什么停」。

## 12. 非目标

| 不做 | 理由 | 何时重新考虑 |
|---|---|---|
| 并行节点执行 | 先验证切片质量，否则并行只会放大切片错误 | v1 冒烟通过后 |
| 图形化 TUI | 文本矩阵已够读 | 节点 > 30 时 |
| 跨会话 / 多项目 | 单项目单会话是 90% 场景 | 有人真的需要时 |
| 远程 server | Cairn 需要它是因为多 dispatcher；这里不需要 | 团队共享黑板时 |
| 双阶段 conclude 收尾 | 节点粒度小，失败重试比收尾便宜 | 节点变大时 |

## 13. 演进方向

1. **并行执行**：`touches` 不重叠的 ready 节点各开 worktree
2. **节点级增量验证**：只跑受影响测试（依赖图 × 测试映射）
3. **跨会话恢复**：board.json 已持久化，补 `events` 回放即可
4. **档案化验收阶梯**：前端 / 后端 / 数据迁移各一套 `config.json` 预设

## 附录 A · 与 Cairn 的差异与代价

| 维度 | 收益 | 代价 |
|---|---|---|
| plan-first 建图 | 进度可见、可并行、可人工把关 | 计划错了会一路错下去；靠 §9 兜底 |
| 节点职责单元 | 上下文可切片、验收可定位 | 拆分成本；切错要重规划 |
| 独立 verify | 判与被判分离 | 多一次调用；靠 §8.2 兜底 |
| 扩展管门禁 | 不可作弊 | 门禁规则本身要维护 |
| 串行执行 | 简单、无合并冲突 | 大需求耗时线性增长 |

## 附录 B · 失效条件

本设计的以下前提被推翻时需重开：

1. **需求可分解为职责单元** —— 若需求高度耦合（如一次性协议重写），拆出的节点 `touches` 必然重叠，节点模型失效
2. **验收可命令化** —— 若项目没有可运行测试（纯 UI/视觉/文档），`unit`/`acceptance` 级无法执行，只剩人工判断
3. **依赖方接口可预先声明** —— 若接口本身需要探索才能确定，`provides` 无法填，`map` 阶段会反复重规划
4. **单节点单会话可完成** —— 若 200 行上限普遍不够，切片粒度需上调，subagent 上下文优势减弱
