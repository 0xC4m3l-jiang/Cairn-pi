---
name: cairn-execute
description: 按节点图逐节点开发。当用户说「按图开始开发」「执行节点」「跑 execute」，或闸门已确认后推进实现时使用。每个节点派一个上下文独立的 subagent，验收由独立 verify subagent 或扩展执行。
---

# cairn-execute：逐节点开发

前置：闸门已确认（`/cairn execute` 通过）。未确认不要动代码。

## ④ skeleton：先搭骨架

1. 按 `architecture.modules` 建目录
2. 为每个节点写 `provides` 里的接口桩（函数签名 + 抛 `not implemented`）
3. 跑构建 / typecheck，必须通过

骨架不通过就不进入逐节点阶段——否则每个节点都在坏基础上开工。

## ⑤ 逐节点（一次一个）

```text
循环：
  1. cairn_coverage    → 取当前 ready 节点
  2. cairn_node_claim  → 认领（返回需求/验收/测试/探针/边界/接口 + 工程约定）
  3. 派 subagent 实现   → 只给切片上下文（见下）
  4. 写 spec probes    → 把 acceptance 里给定测试没覆盖的条款落成断言
  5. cairn_node_submit → 提交 claim + changedFiles（含探针文件，越界会被拒）
  6. 验收：
       优先：cairn_node_verify(run=true)，由扩展自己跑 tests + probes
       或：  派独立 verify subagent（只读）→ 把证据交给 cairn_node_verify
  7. 失败 → cairn_node_fail，记录原因
  8. 直到全部节点 done 或触发重规划
```

> `cairn_node_claim` 已返回节点完整切片（requirement / acceptance / tests / touches / 接口），无需再单独 `cairn_board_read`。

### 节点 subagent 的输入

完整模板见 `cairn-map/references/context-slicing.md`。要点：

- 只给该节点的 `requirement` / `acceptance` / `tests` / `probes` / `touches`
- 只给依赖节点的 `provides` **签名**，不给实现
- 给项目约定（风格、构建命令）
- **必须**把 `cairn_node_claim` 返回的「工程约定」块原样转给 subagent
- **不给**整体计划、其它节点对话、失败节点的排错过程

### 规格探针（必做，不是可选）

节点实现完，还必须写 `probes` 里声明的文件：

1. 逐条读该节点的 `acceptance`，把**给定测试没覆盖**的条款落成断言
2. 边界必扫：未知键 / 原型链键（`toString`/`constructor`/`__proto__`）/ 空值 / 非正整数 / 重复调用 / 返回副本 / 事件顺序
3. 探针文件属于该节点 `touches`，不算改 `tests/`

**不写探针、或探针只重跑给定测试，都算没做完**——`probe` 级会判 fail。

### 验收

```text
独立 verify subagent：
  工具：read, grep, find, ls, bash（无 write/edit）
  输入：只给 claim + acceptance + 要跑的命令原文
  输出：每级 命令 + 退出码 + 输出片段
```

拿到结果后调用 `cairn_node_verify(nodeId, levels)`。扩展会做三层复核：
命令一致性、证据形状、module 级复跑。任何一层不过就判 fail。

**不要**自己声称测试通过。扩展只认实测退出码。

## 失败处理

| 情况 | 动作 |
|---|---|
| 验收失败 | `cairn_node_verify` 已把节点置 failed，读失败级别 |
| 实现方向错 | `cairn_node_fail(nodeId, reason)` |
| `attempts < maxAttempts` | 重新 claim 再试，切片里加上失败级别与摘录 |
| `attempts >= maxAttempts` | 停下，进入重规划：`/cairn map --replan <nodeId>` |
| 改动越界 | 缩小改动范围，不要扩大 `touches` 来迁就实现 |

## 串行约束

一次只跑一个节点。`touches` 有重叠的节点**绝对不能**并行——这是并行阶段（v2）的前置条件。
当前版本发现两个 ready 节点 `touches` 重叠，应视为地图缺陷，回 `cairn-map` 调整。

## 完成判据

全部节点 `done` 且证据齐全 → 进入 `cairn-integrate`。

**硬性停止**：当 `cairn_node_verify` 返回「全部节点已完成」或 `cairn_coverage` 显示所有节点 `done` 时：
1. 立即 `cairn_integrate`（或 `/cairn integrate`）
2. 立即 `cairn_report`（或 `/cairn report`）
3. **停止。不要再调用任何工具、不要等待、不要重复检查。**

任一节点未完成就**不要**进入 integrate；`/cairn status` 会告诉你还差什么。
