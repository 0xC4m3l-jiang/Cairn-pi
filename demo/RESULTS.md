# 对比实验结果

两个实验：简单任务（单文件）与复杂任务（4 模块跨文件）。实验设计见各 `README.md` 说明；指标在开跑前固定，未事后调整。两组各用两个 subagent 并行跑，`env -u PI_PACKAGE_DIR` 避免宿主残缺环境变量。

## 实验一 · 简单任务（单文件 todo，6 用例）

### 结果总览

| 指标 | A 组（原生 pi） | B 组（cairn-pi） | 差异 |
|---|---|---|---|
| M1 `npm test` | exit 0，6 pass / 0 fail | exit 0，6 pass / 0 fail | 平 |
| M2 范围控制 | 只改 `src/todo.mjs`；测试 md5 未变 | 只改 `src/todo.mjs`（另加 `.cairn/`）；测试 md5 未变 | 平 |
| M3 需求覆盖 | R1/R2/R3 共 6 条全绿 | 同左 | 平 |
| M4 可追溯性 | ❌ 无法逐条给证据 | ✅ 3 节点 × (unit + acceptance) | **B 胜** |
| M5 中断可恢复 | ❌ 无进度状态 | ✅ `.cairn/board.json` | **B 胜** |
| M6 自证风险 | ✅ 无 | ✅ 无 | 平 |
| 耗时 | **28 秒** | **255 秒**（无空转，自然退出） | 原生 pi 快约 9 倍 |

### 结论（简单任务）

小任务上 cairn-pi **没有功能提升**，慢约 9 倍；换来基线结构上做不到的「逐条需求证据链 + 可恢复进度」。

## 实验二 · 复杂任务（4 模块图书借阅系统，15 用例）

需求见 [`requirement-complex/REQ.md`](requirement-complex/REQ.md)：`books` / `members` / `loans` / `reports` 四模块，`loans` 依赖 `books+members`，`reports` 依赖三者，靠工厂函数 + 依赖注入组合。

### 结果总览

| 指标 | A 组（原生 pi） | B 组（cairn-pi） | 差异 |
|---|---|---|---|
| M1 `npm test` | exit 0，15 pass / 0 fail | exit 0，15 pass / 0 fail | 平 |
| M2 范围控制 | 只改 `src/` 4 文件；测试 md5 未变 | 只改 `src/` 4 文件 + `.cairn/board.json`；测试 md5 未变 | 平 |
| M3 需求覆盖 | R1–R4 共 15 条全绿 | 同左 | 平 |
| M4 可追溯性 | ❌ 无法逐条给证据 | ✅ 4 节点 × (unit + acceptance) | **B 胜** |
| M5 中断可恢复 | ❌ 无进度状态 | ✅ `.cairn/board.json`（4 节点 done + 审计流） | **B 胜** |
| M6 自证风险 | ✅ 无 | ✅ 无 | 平 |
| 耗时 | **60 秒** | **140 秒** | 原生 pi 快约 2.3 倍 |

### B 组黑板状态（`board.json` 实测）

```
nodes: n01:done:books n02:done:members n03:done:loans n04:done:reports
events: gate,gate,claim,submit,verify,claim,submit,verify,claim,submit,verify,claim,submit,verify,verify
integrate: module=0
```

### B 组的追溯矩阵（`/cairn report` 实际输出）

| 模块 | 节点 | 状态 | 验收 | 证据 |
|---|---|---|---|---|
| books | n01 createBooks 图书建档/查询/可借状态 | done | unit ✓ acceptance ✓ | `node --test …` → exit 0 |
| members | n02 createMembers 会员建档/查询 | done | unit ✓ acceptance ✓ | `node --test …` → exit 0 |
| loans | n03 createLoans 借书/还书 | done | unit ✓ acceptance ✓ | `node --test …` → exit 0 |
| reports | n04 createReports 汇总统计 | done | unit ✓ acceptance ✓ | `node --test …` → exit 0 |

未验证项：无。

### 结论（复杂任务）

任务变大后，cairn-pi 的固定开销被摊薄：**慢 9 倍降到慢 2.3 倍**，同时拿到 4 节点的逐条证据链与可恢复进度。这是本包真正的适用区间——**多模块、跨文件依赖、需要审计/交接/恢复**。

## 实验三 · 高难任务（5 模块事件溯源 + 质量对比）

需求见 [`requirement-hard/REQ.md`](requirement-hard/REQ.md)：`events` / `inventory` / `orders` / `snapshots` / `reports` 五模块，append-only 日志、幂等下单、库存原子性、浅拷贝隔离。

本轮除了「测试是否通过」，加了两层质量测法：

1. **隐藏探针**（[`hard-probes/probes.test.mjs`](hard-probes/probes.test.mjs)）—— 11 条严格由规格推出、但给定测试没覆盖的边界用例，两组都没见过
2. **盲评** —— 两组 `src/` 拷到中性目录并随机打乱映射，冷上下文 reviewer 按 8 维量表评分，事后解盲（映射文件只读 600）

### 结果总览

| 指标 | A 组（原生 pi） | B 组（cairn-pi） | 差异 |
|---|---|---|---|
| M1 `npm test` | exit 0，25/25 | exit 0，25/25 | 平 |
| M2 范围控制 | ⚠️ `src/` 5 文件 + 额外 `docs/Log.md`（超范围） | `src/` 5 文件 + `.cairn/board.json`（协议产物） | B 胜 |
| M3 需求覆盖 | 25 条全绿 | 25 条全绿 | 平 |
| M4 可追溯性 | ❌ 无 | ✅ 5 节点 × (unit+acceptance) | **B 胜** |
| M5 中断可恢复 | ❌ 无 | ✅ `board.json` | **B 胜** |
| **M7 隐藏探针** | **11/11** | **10/11** | **A 胜** |
| **M8 盲评（满分 40）** | **30** | **24** | **A 胜** |
| M6 自证风险 | 无（25/25 实测） | 无（25/25 实测），但证据链未覆盖规格违规 | 平 |
| 代码行数 | 189 | 144 | B 更短 |
| 耗时 | **74 秒** | **198 秒** | A 快 2.7 倍 |

### 隐藏探针结果

| 组 | 通过 | 失败项 |
|---|---|---|
| 参考实现（公平性验证） | 11/11 | —— |
| A 组（原生 pi） | 11/11 | —— |
| B 组（cairn-pi） | 10/11 | **P11 未知 sku 必须返回数字 0（含原型链上的键）** |

失败原因（B 组实际代码）：

```js
const levels = {};                       // 普通对象
stock(sku) { return levels[sku] ?? 0; }  // 命中原型链
inventory.stock("toString")              // → Function，不是 0
```

R2 明写「未知 `sku` 返回 `0`」。B 组 25 条给定测试全绿、5 个节点各有 `unit+acceptance exit 0` 证据，**却带着一条规格违规**。A 组用 `Map` 存库存，无此洞。

### 盲评结果（8 维，1–5 分）

解盲映射：`alpha = cairn-pi`，`beta = 原生 pi`。

| 维度 | cairn-pi | 原生 pi | 依据 |
|---|---|---|---|
| D1 边界与错误处理 | 3 | 4 | cairn 普通对象 → 原型链洞；原生用 `Map` |
| D2 状态不变量保护 | 3 | 4 | 原生先落事件再改投影；cairn 反序 |
| D3 跨模块接缝 | 3 | 4 | cairn `byType` 依赖 `this`，解构即崩 |
| D4 可扩展性 | 3 | 3 | 两边都硬编码事件类型字符串 |
| D5 结构清晰度 | 4 | 4 | 各有优劣（cairn 有同名遮蔽；原生更啰嗦） |
| D6 防御性集中度 | 3 | 3 | 两边 `placeOrder` 都重写一遍校验 |
| D7 可测性/可注入性 | 3 | 4 | 原生闭包无 `this`，可拆开注入 |
| D8 意图表达 | 2 | 4 | cairn 全仓 0 注释；原生写明原子性「为什么」 |
| **合计** | **24** | **30** | **原生 pi 胜** |

### 两边共有的缺陷（不是差异，是共同短板）

`getOrder()` 与 `placeOrder()` 都返回内部对象本体，调用方改 `status` 即可绕过 `cancelOrder`：

```js
orders.getOrder(1).status = "HACKED";   // 内部状态被污染
```

两组行为完全一致，说明这是「没写成测试就不会做」的典型。

### 结论（高难任务）

**cairn-pi 在本轮买到的是审计链与恢复能力，不是更好的代码。**

- 功能上两者持平（25/25）
- **逻辑质量上原生 pi 更高**（探针 11/11 vs 10/11；盲评 30 vs 24）
- 速度上原生 pi 快 2.7 倍
- cairn-pi 唯一结构性优势：5 节点逐条证据链 + `board.json` 可恢复进度

**最重要的教训：证据链 ≠ 逻辑正确。** cairn-pi 的 `unit+acceptance exit 0` 只证明「我给它的测试跑绿了」，证明不了「实现符合规格」。规格里没写成测试的条款，它一样会漏。

想把 cairn-pi 用在逻辑质量上，必须把规格条款**全部**写成测试或探针——它只守你给它的边界。

### 代码级对比（模块 / 链路 / 函数规范）

盲评是主观分。以下是可复现的客观差异。

**① 模块划分**：完全相同（5 模块、零 import、纯工厂注入、依赖方向一致）。差在出口边界硬度：原生 pi 4 处返回内部活对象，cairn-pi 0 处。

**② 链路逻辑**（最实质的差异）：

| 链路 | 原生 pi | cairn-pi |
|---|---|---|
| inventory 写操作 | 先 append 后改 Map ✅ | 同 ✅ |
| `orders.cancelOrder` | release → 改 status → 最后 append ❌ | append → 改 status → release ✅ |
| 取消事件载荷 | `{id}`（无法重建） | `{id,sku,qty,key}` ✅ |
| `rebuild` reducer 实参个数 | 4（多传 index/array） | 2 ✅ |

后果：原生 pi 的取消事件不带 sku/qty，任何想从事件日志重建订单投影的下游模块都拿不到数据——**事件溯源链在取消这一步断了**。

**③ 函数规范**：

| 项 | 原生 pi | cairn-pi |
|---|---|---|
| `placeOrder()` 无参 | `TypeError` | 业务错误 ✅ |
| 公开 API 返回副本 | 部分 | 全部 ✅ |
| `levels()` 副本实现 | 普通 `{}` | `Object.create(null)` ✅ |
| 分支点总数 | 13 | 8 |
| 最长单函数 | 55 行 | 50 行 |
| 注释行 | 1 | 27 |
| 校验器重复 | 2 处且写法不一致 | 2 处但写法一致 |
| 事件类型硬编码 | 5 处 | 5 处（共同短板） |

**④ 数据正确性（真 bug）**：原生 pi 的 `levels()` 用普通 `{}` 做副本，合法 sku 名 `__proto__` 被静默丢弃：

```text
原生 pi  : stock("__proto__") = 5，但 levels() 不含它，summary().totalStock = 9（应为 14）
cairn-pi : stock("__proto__") = 5，levels() 保留，summary().totalStock = 14 ✅
```

补成探针 P12 后：**原生 pi 11/12，cairn-pi 12/12**。

**⑤ 共同短板**：事件类型字符串裸写 5 处无常量表；qty 校验器两模块各写一份；`new Date()` 不可注入；都假设只有两个 status；cairn-pi 自身一处注释（「幂等表只在成功后写入」）与代码不符（`byKey.set` 在 `append` 之前）。

### 修复后复测（2026-10-31）

按上节结论修包，然后重跑 B 组 + 用同一套探针与两名独立盲评复测。

**修复内容**：

| 修改 | 文件 | 作用 |
|---|---|---|
| 新增 `probe` 验收级别 + `{probes}` 占位符 | `lib/contracts.ts`、`lib/verify.ts`、`lib/gates.ts`、`lib/coverage.ts` | 节点必须声明并写出规格探针；空则判 fail |
| 新增工程约定注入 | `lib/conventions.ts`、`extensions/cairn.ts` | 9 条硬约定（Map / 返回副本 / 禁 `this` / 事件先落库 / 边界枚举含原型链键）进每个节点 brief |
| 强制「需求→断言」步骤 | `skills/cairn-map`、`skills/cairn-execute` | `acceptance` 逐条列举 + `probes` 声明，不给反例不算完成 |

**复测结果**：

| 指标 | 修复前 cairn-pi | 修复后 cairn-pi | 原生 pi |
|---|---|---|---|
| 给定测试 | 25/25 | 25/25 | 25/25 |
| 隐藏探针（12 条） | 10/11 | **12/12** | 11/12 |
| `stock("toString")` | `Function`（违规） | **`0`** | `0` |
| `__proto__` 作为 sku | —— | **保留** | 静默丢失 |
| `byType` 解构 | TypeError | **正常** | 正常 |
| `getOrder` 返回内部引用 | 泄漏 | **已隔离** | 泄漏 |
| 注释行数 | 0 | **27** | 1 |
| 盲评评审 #1（满分 40） | 24 | **39** | 24 |
| 盲评评审 #2（满分 40） | —— | **34** | 22 |
| 代码行数 | 144 | 199 | 189 |
| 耗时 | 198s | 331s | **74s** |

解盲映射：`alpha = cairn-fixed`，`beta = 原生 pi`（`/tmp/blind2/MAPPING.txt`，600 权限）。

**两名评审独立给出的共同结论：**

- 原生 pi 的共同短板：`events.append` / `getOrder` / `placeOrder` 四处返回内部活对象，外部可改穿；取消事件只带 `{id}`，订单投影无法从事件日志重建；几乎无注释
- cairn-pi 的共同优势：`copyEvent` 单一复制出口、内部 `Map` + `Object.create(null)` 防原型链、先落事件再改投影、每处不变量有「为什么」注释

**方差诚实标注**：原生 pi 是同一份代码，两轮评审给出 30 与 24 分（方差 6 分）。所以均值 36.5 vs 23 的方向可信，具体分值精度有限。每组只跑 1 次。

**结论修正**：修复前写的是「cairn-pi 买到的是审计链，不是更好的代码」。修复后该结论**不再成立**——把工程约定与规格探针变成不可跳过的步骤后，cairn-pi 确实产出了更好的代码。代价是 4.5 倍耗时，且前提是「你先把约定写进包」。

## 综合结论与选型

| 场景 | 建议 |
|---|---|
| 单文件小改动、一次性任务 | **不用**。原生 pi 快得多 |
| 多模块需求、要写对代码 | 用。修复后盲评 36.5 vs 23 |
| 需要交接 / 审计 / 回溯某条需求的证据 | 用。这是它唯一不能替代的能力 |
| 长任务、可能被打断 | 用。`board.json` 能接着做 |
| 已有完整测试、只想批量跑验收 | 用。`--verify-only` |
| 需要并行开发同一需求 | 暂时不用，v1 是串行 |

## 复现

```bash
# 简单任务
bash run-baseline.sh
bash run-cairn.sh

# 复杂任务
bash run-complex-baseline.sh
bash run-complex-cairn.sh

# 高难任务
bash run-hard-baseline.sh
bash run-hard-cairn.sh
```

> 注意：若 `pi` 启动报 `ENOENT …theme/dark.json`，说明环境变量 `PI_PACKAGE_DIR` 指向残缺目录。
> 脚本已内置 `env -u PI_PACKAGE_DIR`，正常不会触发；若在其它环境手动跑 `pi`，需先 `unset PI_PACKAGE_DIR`。
