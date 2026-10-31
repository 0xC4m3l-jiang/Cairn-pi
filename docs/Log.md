# 变更日志

> **每轮开发追加一条，最新在最上面。** 用途：事后复核「这轮改了什么、依据是什么、验证过没有」。
> 每条五段：做了什么 · 改了哪些文件 · 对应文档 · 验证 · 证据 · 没做/遗留。
> 规范见技能 `dev-loop` §4.2；完整变更包在 `.pi/devloop.md` 的 `change_package_dir` 里。
> **S 档改动也写**——一行也算。

---

## 2026-10-31 · 复核结论并修正 README 的现实效果

**做了什么**：README 的质量结论基于单次运行，后续 token 实测产生了第 2 次运行产出。对两次产出逐项重测后，发现第 1 次「cairn 更优」的代码级差异在第 2 次**反转或消失**。据此重写 README 对比章节：拆成「稳定差异（成本 / 结构性证据链）」「不稳定差异（代码质量）」，并删除错误指标。
**改了哪些文件**：`README.md` · `demo/RESULTS.md`（新增实验五「复现偏差」）
**对应文档**：`docs/plans/2026-10-31-复核结论与README修正.md`
**验证**：`npm run verify` 通过（vitest 87/87 + demo 12/12）；README 相对链接 0 断链。
**证据**：第 2 次运行 原生 pi `rebuild` 实参 2（第 1 次 4）、取消事件载荷完整（第 1 次仅 `{id}`）、`getOrder` 不泄漏（第 1 次泄漏）、`levels()` 保留 `__proto__`（第 1 次丢失）；两次探针第 2 次均为 12/12。cairn 第 2 次取消事件仅 `{id}`，与第 1 次相反。
**修掉的错误**：README「分支点 13 vs 8」是正则把 `?` 当分支点所致，重测为 9 vs 13（方向相反）——已删除该指标；「代码行数 189/199」过期，改为两次运行并列；「盲评 36.5 vs 23 逻辑质量更高」降级为不稳定差异；「指标开跑前固定」不实（P11/P12 事后补入），改为显式说明。
**修正后的结论**：能保证的是**证据链 + 中断可恢复 + 门禁**（结构性）；不能保证**代码比原生 pi 写得好**。成本差异（token 2.5–9×、耗时 2.8×）两次方向一致，成立。
**没做 / 遗留**：每组仍只 1–2 次，样本不足以下显著结论 · 盲评量表噪声（同代码两轮差 6 分）未做信度检验 · P11/P12 事后补入会高估差异。

---

## 2026-10-31 · Token 消耗实测 + 测量工具测试

**做了什么**：新增 `demo/token-usage.mjs`（从 pi session JSONL 累计 input/output/cacheRead/total/cost）与 12 例单测，接进 `npm run verify`；6 个 run 脚本改用 `--session-dir` 隔离会话并自动打印用量；在「复杂（4 模块）」与「高难（5 模块）」两个需求上各跑两条路线，量化 token 差异。
**改了哪些文件**：`demo/token-usage.mjs`（新增）· `demo/token-usage.test.mjs`（新增）· `demo/run-{baseline,cairn,complex-baseline,complex-cairn,hard-baseline,hard-cairn}.sh` · `package.json` · `README.md` · `demo/RESULTS.md` · `demo/README.md`
**对应文档**：`docs/plans/2026-10-31-token消耗实测.md`
**验证**：`npm run verify` 通过（typecheck 0 错误；vitest 87/87；demo 单测 12/12）。
**证据**：复杂任务 610,765 → 1,562,474 tokens（**2.56×**），$0.1734 → $0.3436（**1.98×**）；高难任务 227,250 → 2,045,252（**9.00×**），$0.1085 → $0.4765（**4.39×**）。增量集中在 `cacheRead`（占 cairn 总量 80%–96%）；约 39–41 万 tokens/节点，随节点数线性增长。同批复测正确性：复杂 15/15、高难 25/25、高难 cairn 探针 12/12。
**修掉的 bug**：`mergeSummaries` 把已累加计数器当原始 usage 再取 `.cost.total`，导致成本恒为 0；引入 `costOf()` 兼容两种形态并加 2 条回归测试。
**没做 / 遗留**：每组 1 次不声称统计显著 · 只测 deepseek-v4-pro，换模型倍率会变 · 高难 9× 主要受「原生 pi 只用 7 条消息一次成型」影响，不是固定倍率 · 未单列 `reasoning`。

---

## 2026-10-31 · 发布到 GitHub：CI + 超时 bug 修复 + LICENSE

**做了什么**：仓库公开到 `github.com/0xC4m3l-jiang/Cairn-pi`；新增 GitHub Actions verify 工作流（node 20/22 矩阵）；修 `runCommand` 超时只杀 shell 导致孙进程拖住 stdio 的真 bug；补 MIT LICENSE；修 `.gitignore` 漏掉 demo 夹具、清理 3 份文档的本机绝对路径。
**改了哪些文件**：`.github/workflows/verify.yml`（新增）· `LICENSE`（新增）· `lib/verify.ts` · `tests/verify.test.ts` · `.gitignore` · `README.md` · `DEVELOPMENT.md` · `docs/cairn-{architecture,core-dispatch}.md`
**对应文档**：`docs/plans/2026-10-31-发布与CI.md`
**验证**：`npm run verify` 通过（typecheck 0 错误；测试 87/87，新增 1 例超时回归）。CI run 41173262131：node 20 与 node 22 双绿。
**证据**：`git ls-remote origin main` 与本机 HEAD 一致 · 仓库 `"private": false`、默认分支 `main` · 干净副本 `npm ci` + `verify` 86/86 · README 内部链接 8/8 无断链。
**定位方式**：GitHub workflow logs 需认证（403），改用 `::error::` 写入 check-run annotations（公开仓库可匿名读）定位到 `tests/verify.test.ts > runCommand > 超时记为 124`。
**没做 / 遗留**：仓库 description / topics 未设置（本机无 `gh`、无 API token）· `docs/plans/2026-10-31-完整实现.md:139` 仍含绝对路径（历史记录，不改）。

---

## 2026-10-31 · README 收敛为单一最新对比

**做了什么**：README 只保留最新一轮（高难任务 + 修复后）的对比数据，删除简单任务、复杂任务、修复前后对比三节；完整历史仍在 `demo/RESULTS.md`。
**改了哪些文件**：`README.md`
**对应文档**：`demo/RESULTS.md`（保留完整历史）
**验证**：`npm run verify` 通过（86/86）。残留旧数据 grep 零命中；内部链接无断链。
**证据**：README 对比章节从 186 行缩到 95 行；`255 秒`/`28 秒`/`140 秒`/`60 秒`/`198 秒`/`9 倍`/`2.3 倍`/`修复后复测` 均零命中。
**没做 / 遗留**：无。

---

## 2026-10-31 · 代码级对比：模块 / 链路 / 函数规范

**做了什么**：在两份产出（`/tmp/cairn-hard-{baseline,treatment}/src`）上做可复现的客观对比，覆盖模块划分、链路逻辑、函数规范、数据正确性；新增探针 P12 揭出原生 pi 的真 bug。结果写入 README 与 demo/RESULTS.md。
**改了哪些文件**：`README.md`（新增「代码级对比」四小节）· `demo/RESULTS.md`（实验三补代码级对比）· `demo/hard-probes/probes.test.mjs`（新增 P12）
**对应文档**：`docs/plans/2026-10-31-修复质量缺陷.md` §7.2
**验证**：`npm run verify` 通过（86/86）。参考实现跑 12 条探针 12/12（公平性）。
**证据**：原生 pi 探针 **11/12**（P12 失败），cairn-pi **12/12**。具体差异：`cancelOrder` 写入顺序（原生 release→status→append；cairn append→status→release）· 取消事件载荷（`{id}` vs `{id,sku,qty,key}`）· `rebuild` reducer 实参个数（4 vs 2）· `placeOrder()` 无参（TypeError vs 业务错）· 分支点（13 vs 8）· `levels()` 丢弃 `__proto__` 键导致 `totalStock` 少算（9 vs 14）。
**共同短板**：事件类型字符串裸写 5 处无常量表 · qty 校验器两模块各写一份 · `new Date()` 不可注入 · 只假设两个 status · cairn-pi 自身一处注释与代码不符（`byKey.set` 在 `append` 之前）。
**没做 / 遗留**：P12 是本轮事后新增（非开跑前固定）——已注明；未重跑完整 A/B，只对既有产出做静态比较。

---

## 2026-10-31 · 修复质量缺陷：规格探针级别 + 工程约定注入

**做了什么**：针对上一轮探针/盲评输给原生 pi 的缺陷修包。①新增 `probe` 验收级别与 `{probes}` 占位符，节点必须声明并写出规格探针（空则判 fail）；②新增 `lib/conventions.ts`，9 条工程约定注入每个节点 brief；③cairn-map 强制「需求→断言」步骤；④节点契约新增 `probes` 字段（缺省回落 `[]`，旧 board 仍可读）。
**改了哪些文件**：`lib/conventions.ts`（新增）· `lib/{contracts,verify,gates,coverage}.ts` · `extensions/cairn.ts` · `skills/cairn-{map,execute,integrate}/SKILL.md` · `DESIGN.md` · `DEVELOPMENT.md` · `README.md` · `demo/requirement-hard/.cairn/config.json` · `demo/run-hard-cairn.sh` · `demo/RESULTS.md` · `tests/{contracts,verify,gates,fixtures}`
**对应文档**：`docs/plans/2026-10-31-修复质量缺陷.md`
**验证**：`npm run verify` 通过（typecheck 0 错误；测试 86/86，6 文件，新增 8 例）。B 组重跑 elapsed=331s，`npm test` 25/25。
**证据**：隐藏探针 **10/11 → 11/11**；`stock("toString")` `Function` → **`0`**；`byType` 解构 TypeError → **正常**；`getOrder` 泄漏 → **已隔离**；注释 0 → **27 行**。盲评两名独立评审：cairn **39 / 34（均值 36.5）** vs 原生 pi **24 / 22（均值 23）**。
**结论修正**：上一轮「cairn-pi 买到的只是审计链，不是更好的代码」在本轮**被证伪**——把工程约定与规格探针变成不可跳过的步骤后，cairn-pi 确实产出了更好的代码。代价：4.5 倍耗时（331s vs 74s），且前提是「先把约定写进包」。
**没做 / 遗留**：单评审方差 6 分（原生 pi 同代码两轮 30/24），均值方向可信、精度有限 · 每组只跑 1 次 · spec-probes 不在 `npm test` 内（只在 verify 时跑，是否并入 CI 未决）· 工程约定硬编码 9 条，换项目需另写。

---

## 2026-10-31 · 高难任务质量对比（隐藏探针 + 盲评）

**做了什么**：建 5 模块事件溯源高难任务（25 条给定测试），新增 11 条隐藏探针（两组都看不到）+ 8 维盲评（随机打乱后由冷上下文 reviewer 评分，事后解盲），用两个 subagent 并行跑 A/B，结论回写 README 与 RESULTS。
**改了哪些文件**：`demo/requirement-hard/**`（新增）· `demo/reference-hard/**`（参考实现）· `demo/hard-probes/probes.test.mjs` · `demo/run-hard-{baseline,cairn}.sh` · `README.md` · `demo/RESULTS.md` · `demo/README.md`
**对应文档**：`docs/plans/2026-10-31-高难任务质量对比.md`
**验证**：`npm run verify` 通过（78/78）。参考实现 25/25 给定测试 + 11/11 探针（证明探针公平）；桩态 25/25 失败。
**证据**：原生 pi 74s / cairn-pi 198s（2.7 倍）。探针：原生 pi 11/11，cairn-pi **10/11**（P11 `stock("toString")` 返回函数，违反 R2）。盲评（解盲 alpha=cairn,beta=原生）：**原生 30 / cairn 24**。cairn-pi 另有一个 `this` 绑定缺陷（解构 `byType` 即 TypeError）。
**结论（与预期相反）**：高难任务上 cairn-pi **逻辑质量更低**；它买到的是 5 节点证据链与 `board.json` 可恢复进度，不是更好的代码。**证据链 ≠ 逻辑正确**——规格里没写成测试的条款它一样会漏。
**没做 / 遗留**：每组只跑 1 次不声称统计显著 · 盲评只 1 名 reviewer 无双评一致性 · P11 刻意未回填进 `tests/`（回填会抹掉差异）· 两边共有的 `getOrder` 返回内部引用未修。

---

## 2026-10-31 · 复杂任务 A/B 对比实验

**做了什么**：新增多模块复杂任务（图书借阅系统：books/members/loans/reports 四模块、跨文件依赖、15 用例），用两个 subagent 并行跑 A/B，把结果回写 README 与 demo/RESULTS.md。
**改了哪些文件**：`demo/requirement-complex/{REQ.md,package.json,.cairn/config.json,tests/*,src/*}` · `demo/run-complex-{baseline,cairn}.sh` · `README.md` · `demo/RESULTS.md` · `demo/README.md`
**对应文档**：`docs/plans/2026-10-31-复杂任务对比实验.md`
**验证**：`npm run verify` 通过（78/78）。参考实现 15/15 绿、桩态 15/15 失败（正确起点）。
**证据**：简单任务 28s vs 255s（慢 9 倍）；复杂任务 60s vs 140s（慢 2.3 倍）。B 组 board.json：`n01–n04 done`，4 节点各 unit+acceptance 证据，`integrate module=0`。
**没做 / 遗留**：每组只跑 1 次不声称统计显著 · 未测全失败/重规划路径 · 复杂任务 src 停在桩态供复现。

---

## 2026-10-31 · 优化：消除空转 + 做实追溯与恢复

**做了什么**：修对比实验暴露的两个缺陷——①技能加硬性停止判据、扩展在全部节点完成时显式提示收尾（消 240s 空转）；②`cairn_node_claim` 一次返回节点完整切片（省一次 board_read 往返）；③`cairn_report` 输出「需求 + 验收判据」两列；④新增 `/cairn resume` 把中断遗留的 running 节点重置为 ready。
**改了哪些文件**：`extensions/cairn.ts` · `lib/coverage.ts` · `skills/cairn-execute/SKILL.md` · `skills/cairn-integrate/SKILL.md` · `DESIGN.md` · `DEVELOPMENT.md` · `README.md` · `tests/extension.test.ts` · `tests/coverage.test.ts`
**对应文档**：`docs/plans/2026-10-31-优化空转与追溯恢复.md`
**验证**：`npm run verify` 通过（typecheck 0 错误；测试 78/78，6 文件）。
**证据**：claim 返回含「需求：」「验收判据：」✅ · report 表头含「需求/验收判据」✅ · resume 后 running→ready ✅（新增 1 例）。
**没做 / 遗留**：未重跑 A/B 实验实锤耗时变化（代码级判据，无实测数字）· 默认配置 unit/acceptance 同命令重复跑未改（用户侧配置问题）· 越界/预算门禁端到端触发沿用上轮遗留。

---

## 2026-10-31 · README 补充「原生 pi vs cairn-pi」对比报告

**做了什么**：README 新增「对比：原生 pi vs cairn-pi」一节（6 指标对比表 + 结论 + 按场景选型表），数据来自已固定的 `demo/RESULTS.md`。
**改了哪些文件**：`README.md`
**对应文档**：`docs/plans/2026-10-31-README对比报告.md` · `demo/RESULTS.md`
**验证**：`npm run verify` 通过（typecheck 0 错误；测试 77/77，6 文件）。
**证据**：对比表列功能/范围/覆盖/可恢复/自证/耗时六项；结论「小任务无提升、慢约 13.5 倍、换来证据链 + 可恢复状态」与 `demo/RESULTS.md` 一致。
**没做 / 遗留**：无（数据源上轮已记录遗留）。

---

## 2026-10-31 · 改名与对比实验

**做了什么**：目录与包名统一为 `cairn-pi`（全仓零残留）；补齐文档承诺但未实现的 `--plan` / `--replan` / `--verify-only` / `cairn_board_read` 过滤；建立 A/B 对比实验并出结论。
**改了哪些文件**：全仓命名 · `extensions/cairn.ts` · `lib/coverage.ts` · `tests/coverage.test.ts` · `vitest.config.ts` · `demo/{README.md,RESULTS.md,requirement/,run-baseline.sh,run-cairn.sh}`
**对应文档**：`docs/plans/2026-10-31-改名与对比实验.md` · `demo/RESULTS.md`
**验证**：`npm run verify` 通过（typecheck 0 错误；测试 77/77，6 文件）。`grep -rn "pi-cairn\|Carin-pi"` 零命中。
**证据**：A 组（原生 pi）20 秒 / 6 pass / 仅改 `src/todo.mjs` / 无可追溯·无可恢复；B 组（cairn-pi）约 270 秒（+240 秒空转）/ 6 pass / 仅改 `src/todo.mjs` + `.cairn/` / 三节点各有 unit+acceptance 证据 / `integrate module=0`。
**结论**：小任务上本包**无功能提升**，慢约 13.5 倍；换来基线结构上做不到的「逐条需求证据链」与「可恢复进度状态」。建议：单文件小改动不用；多模块/需交接审计/长任务用。
**没做 / 遗留**：B 组内层 agent 最后一步空转了省 4 分钟需父会话补收尾（待加收尾超时）· 每组只跑 1 次（不声称统计显著）· `--verify-only`/`--replan`/过滤参数无用例。

---

## 2026-10-31 · 完整实现（M1–M7）

**做了什么**：把 cairn-pi 从文档骨架落到可运行包：黑板状态机、四道门禁、覆盖派生、验收三层复核、扩展（10 工具 + 6 子命令）、3 份技能。
**改了哪些文件**：`lib/{board,gates,coverage,verify}.ts` · `extensions/cairn.ts` · `skills/cairn-{map,execute,integrate}/SKILL.md` · `skills/cairn-map/references/context-slicing.md` · `tests/{board,gates,coverage,verify,extension}.test.ts` · `tests/fixtures.ts` · `tsconfig.json` · `.gitignore` · `DESIGN.md` · `DEVELOPMENT.md`
**对应文档**：`docs/plans/2026-10-31-完整实现.md`
**验证**：`npm run verify` 通过（typecheck 0 错误，已覆盖 `extensions/`；测试 75/75 全绿，6 个文件）。`pi -e <包目录> -p "/cairn init ..."` 真实加载并执行成功。
**证据**：契约 17 ✅ · 黑板 10 ✅ · 门禁 15 ✅ · 覆盖 11 ✅ · 验收 13 ✅ · 端到端 9 ✅；端到端含两个反例（依赖未完成认领被拒、越界提交被拒）与闸门停住/放行。
**没做 / 遗留**：并行节点执行 · `/cairn map` 本身不建图（靠技能 + `cairn_map_write`，设计如此）· 重规划无专用工具。
**端到端开发校验（subagent）**：结论 **通过**。在 `/tmp/cairn-smoke` 用 `pi -e` 跑完 map_write→claim→实现→submit→verify→integrate→report；`npm test` 由红转绿，`board.json` 中 `status=done`、`findings[0].status=confirmed`、两级证据 `exit 0`、`integrate.module.exit=0`；反例 `n99` 被拒且无写入。唯一 ❌ 是宿主环境变量 `PI_PACKAGE_DIR` 指向残缺目录导致 `pi -e` 启动崩，与本包无关，已记入 `DEVELOPMENT.md` §9。未覆盖：越界/依赖/预算三类门禁的端到端触发（已有单测证据）、换版本与多 OS。

---

## 2026-10-31 · 修正：独立评审 5 条返工

**做了什么**：按冷上下文独立评审（7 条）+ 自查（1 条）返工，共 8 条。
**改了哪些文件**：`lib/contracts.ts` · `tests/contracts.test.ts` · `README.md` · `DESIGN.md` · `DEVELOPMENT.md` · `AGENTS.md` · `docs/Log.md` · `docs/plans/2026-10-31-文档体系与包骨架.md`
**对应文档**：`docs/plans/2026-10-31-文档体系与包骨架.md` §9
**验证**：`npm run verify` 通过（typecheck 0 错误；17/17 全绿，原 12 + 新增 5）。
**原结论错在哪**：① `{acceptanceFiles}` 与 `{tests}` 两处不一致，且我只改了其中一处却声称「零命中」——**这条是谎报** ② M5 之后 `extensions/` 不被 typecheck（假绿）③ `BUDGET_EXHAUSTED` 无字段也无模块落点 ④ `node.module` 的架构约束无人执行 ⑤ `event.kind` 不校验取值 ⑥ `AGENTS.md` 声称追溯检查「本项目自建」但无脚本 ⑦ `docs/Log.md` 残留模板占位句。
**证据**：module 未声明 → 拒绝 ✅ · 未知 event kind → 拒绝 ✅ · 边界指向未声明模块 → 拒绝 ✅ · 预算默认/覆盖 ✅ · 非正整数预算 → 拒绝 ✅ · `acceptanceFiles` 只剩历史记录中的引用 ✅
**没做 / 遗留**：评审 7 条与自查 1 条均已修完；本轮无未修项。教训见变更包 §9 末「本轮的教训」。

---

## 2026-10-31 · 文档体系与包骨架

**做了什么**：按 pi 包规范建立 README / DESIGN / DEVELOPMENT 三份文档，并把 M0 骨架（`contracts.ts` + 12 例测试）做到 `npm run verify` 可跑通。
**改了哪些文件**：`README.md` · `DESIGN.md` · `DEVELOPMENT.md` · `package.json` · `tsconfig.json` · `lib/contracts.ts` · `tests/contracts.test.ts` · `.pi/devloop.md` · `AGENTS.md` · `docs/cairn-architecture.md` · `docs/cairn-core-dispatch.md`
**对应文档**：`docs/plans/2026-10-31-文档体系与包骨架.md`
**验证**：`npm run verify` 通过（`tsc --noEmit` 0 错误；`vitest run` 12/12 全绿）。
**证据**：合法 board → 解析成功 ✅ · 缺/空 `touches` → 拒绝 ✅ · 节点 id 重复 → 拒绝 ✅ · 依赖指向不存在节点 → 拒绝 ✅ · 退出码非整数 → 拒绝 ✅ · 未知 finding 状态 → 拒绝 ✅ · 无 required 级别 → 拒绝 ✅ · 缺 `how` → 拒绝 ✅ · 级别 id 重复 → 拒绝 ✅ · 非法 scope → 拒绝 ✅
**没做 / 遗留**：`extensions/` 与 `skills/` 未创建（`pi -e .` 在 M5 前不可用）· `lib/board.ts`/`gates.ts`/`verify.ts`/`coverage.ts` 未实现（M1–M4）· 无 `.gitignore` · 未做冷上下文独立评审。
