# cairn-pi 对比实验

同一个需求，两条路线各做一次，看 cairn-pi 是否真的提高开发效果。

两个实验：
- **简单任务**（本节，单文件 todo）—— 测固定开销是否太贵
- **复杂任务**（`requirement-complex/`，4 模块图书借阅系统）—— 测真正适用区间的收益
- **高难任务**（`requirement-hard/`，5 模块事件溯源）—— 测**逻辑质量**：11 条隐藏探针 + 8 维盲评

结果都写在 [`RESULTS.md`](RESULTS.md)。

## 实验设计

| 项 | 值 |
|---|---|
| 需求 | `requirement/REQ.md`（两条路线拿到**完全相同**的文本） |
| 验收测试 | `requirement/tests/todo.test.mjs`（**预先写好**，两条路线都不许改） |
| A 组（基线） | 原生 pi：`pi -p "<REQ>"`，无任何包 |
| B 组（处理） | `pi -e <本包目录> -p "<REQ + 流水线约束>"` |
| 两组起点 | 各自从 `requirement/` 复制一份新目录，互不可见 |

## 指标（跑之前固定，跑完不改）

| # | 指标 | 怎么量 | 判据 |
|---|---|---|---|
| M1 | 功能正确性 | `npm test` 退出码 | 0 = 通过 |
| M2 | 范围控制 | `git status` / 新增改动文件清单 | 只应改 `src/todo.mjs`；改了测试或加无关文件 = 超范围 |
| M3 | 需求覆盖 | 6 条验收用例逐条 | 全绿才算覆盖 |
| M4 | 可追溯性 | 能否回答「哪条需求由什么证据证明」 | 有逐条需求 → 证据的映射 |
| M5 | 中断可恢复 | 是否留下可继续的状态 | 有机器可读的进度状态 |
| M6 | 自证风险 | 是否声称完成但测试实际红 | 出现即判该组失败 |

M4、M5 是这套设计的核心卖点，也是基线**结构上做不到**的部分。

## 失效判据（什么情况下认为本包没优势）

- M1–M3 两组都通过，且 M4/M5 基线也能做到 → 本包无增量
- 本包组 M1 失败或 M2 超范围 → 本包引入的流程反而更差
- 本包组耗时超过基线 3 倍且指标无提升 → 成本不可接受

## 复现

```bash
bash run-baseline.sh   # 简单任务 A 组
bash run-cairn.sh      # 简单任务 B 组

bash run-complex-baseline.sh   # 复杂任务 A 组
bash run-complex-cairn.sh      # 复杂任务 B 组

bash run-hard-baseline.sh      # 高难任务 A 组
bash run-hard-cairn.sh         # 高难任务 B 组
```

高难任务的隐藏探针单独存放（**两组都看不到**）：

```bash
cp hard-probes/probes.test.mjs /tmp/<arm>/probes/
cd /tmp/<arm> && node --test probes/*.test.mjs
```

结果写入 `RESULTS.md`。
