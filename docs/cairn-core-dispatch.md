# Cairn 核心 dispatch 逻辑提取

源码：`Cairn`（`cairn/src/cairn/dispatcher/`）。
本文提取的是 Dispatcher 的核心逻辑，并标注移植到 `cairn-pi`（本项目）时的裁剪。

## 1. 全景：4 组件

```
Cairn Server ──(读/写 API)── Dispatcher ──(管理)── Project Container ──(承载)── Worker(CLI 代理)
```

- **Server**：图的真相源。保存 Fact / Intent / Hint，维护认领(claim)、心跳(heartbeat)、结论(conclude)、项目级 reason lease。
- **Dispatcher**：唯一协议写入者 + 控制面。拉图 → 决定派哪种任务 → 选 worker → 起容器 → 起 worker 进程 → 解析结构化输出 → 写回 Server。**调度是确定性代码，不是 prompt。**
- **Container**：每项目一个执行环境（工具链/网络/worker 进程）。
- **Worker**：无固定角色的代理 CLI（claude/codex/pi）。只收 prompt、返回结构化 JSON，**不直接认领、不直接心跳、不直接调 API**。

## 2. 黑板数据模型（`server/models.py`）

| 实体 | 字段 | 语义 |
|---|---|---|
| `Fact` | `id`, `description` | 已确认的客观发现；图上从 `origin` 长向 `goal` |
| `Intent` | `id`, `from`(fact id 列表), `to`(结论 fact id\|null), `description`, `creator`, `worker`(认领者), `last_heartbeat_at`, `created_at`, `concluded_at` | 声明的探索方向；`to!=null` 表示已结论 |
| `Hint` | `id`, `content`, `creator`, `created_at` | 人工随时注入的判断，agent 下轮读到 |
| `Project` | `status`(active/stopped/completed), `bootstrap_enabled`, `reason`(lease), + facts/intents/hints | 一个 origin→goal 的搜索实例 |

关键约定：`origin` 和 `goal` 是**特殊 id 的 fact**；`intent.from` 指向它派生自哪些 fact；`intent.to` 指向它产出的 fact。

## 3. 主循环（`scheduler/loop.py` — `DispatcherLoop.run`）

```text
loop:
  _reap_futures()                 # 收已完成任务的结局 → 更新 reason 检查点、unhealthy/rejected 窗口
  _reap_cleanup_futures()         # 收容器清理结果
  summaries = client.list_projects()
  _initialize_reason_checkpoints  # 对「已有 open intent 的 active 项目」建立基线
  _refresh_runtime_projects       # runtime 项目集与 active 求交
  _cancel_inactive_tasks          # 非 active 项目 → 取消其运行中任务
  _queue_container_cleanups       # completed/stopped → 排清理
  _dispatch_available(summaries)  # 核心：派发
  sleep(runtime.interval)         # 节拍，兼作 heartbeat 周期
```

## 4. 调度决策（核心：每项目派发优先级）

`_try_dispatch_project` 的单项目决策树：

```text
1. 项目初始态（facts 恰好 == {origin, goal}）？
   ├─ 需要 bootstrap（bootstrap_enabled 且有支持 bootstrap 的 worker）→ dispatch bootstrap
   └─ 否则 → dispatch reason
2. 非初始态：
   ├─ reason lease 空闲 且 _reason_trigger() 非空（新态势）→ dispatch reason
   ├─ 存在未认领 intent → dispatch explore（取 created_at 最新的一条）
   └─ 否则 → skip（图无变化）
```

跨项目：先派「已在运行」的项目（round-robin 游标），再派「新」项目直到 `max_running_projects`；全程受 `max_workers`（全局任务数）和 `max_project_workers`（单项目任务数）约束。

### reason 去重（`_reason_trigger`）—— 按「态势」不按「总图变化」

检查点 `ReasonCheckpoint = (fact_count, hint_count, open_intent_count)`，只在出现下面任一变化时触发 reason：

1. `fact_count` 增加
2. `hint_count` 增加
3. `open_intent_count` 从 `>0` 变 `0`（探索耗尽，需要重新决策）

**不**把「总 intent 数增加」当触发条件（那只是上一次 reason 刚创建了 intent）。首次无检查点 → 触发 `"initial"`。

## 5. worker 选择（`_select_worker` + `worker_select.choose_worker`）

过滤顺序：

1. `task_type ∈ worker.task_types`
2. 该 worker 运行中任务数 `< max_running`
3. 不在 `unhealthy_until` 窗口（失败后 5s 不可选）
4. 不在 `rejected_until` 窗口（被拒后 5s 不可选）

排序：`priority` 升序 → 运行中任务数升序 → `random.random()`。取第一个。

## 6. 三任务统一执行骨架（`tasks/{bootstrap,reason,explore}.py`）

三个任务共享同一套骨架，仅 prompt、契约、写回动作不同：

```text
1. driver = get_driver(worker.type, execution)
2. lease = HeartbeatLease（intent 或 reason）→ start()   # 认领 + 周期心跳
3. container_manager.ensure_running(project_id)
4. [可选] healthcheck（仅 worker_healthcheck=startup_and_task）
5. prompt = render_prompt(load_prompt(group, "<task>.md"), replacements)   # 占位符替换
6. session = driver.prepare_session()
7. argv = driver.build_execute(worker, prompt, session)
8. result = run_worker_process(...)     # spawn 子进程，timeout 按任务类型
9. session = driver.extract_session(...)
10. 检查：cancel_reason → lease.failure → did_timeout → returncode
11. model_output = driver.extract_response_text(result.stdout, result.stderr)
12. payload = parse_json_output(model_output)     # 从 stdout 里抠 JSON 对象
13. kind, data = validate_<task>_payload(payload) # 契约校验
14. 按 kind 写回：conclude（写 fact）| complete（完成）| create_intent
15. 超时/解析失败 → conclude fallback（双阶段：同 session 收尾，只总结不推进）
16. finally: lease.stop() + best_effort_release（放弃 claim）
```

### 各任务差异

| 任务 | prompt 占位符 | 输出契约 | 写回动作 |
|---|---|---|---|
| `bootstrap` | `{origin}` `{goal}` `{hints}` | `fact`+`complete`（主阶段）\| `fact`（收尾） | conclude 写 fact → complete 完成项目 |
| `reason` | `{graph_yaml}` `{fact_ids}` `{open_intents}` `{max_intents}` | `complete` \| `intent(s)` \| 空 | complete \| create_intent \| 不写图 |
| `explore` | `{graph_yaml}` `{intent_id}` `{intent_description}` | `description`（一条客观结论） | conclude 写 fact、结论落定 intent |

## 7. 输出契约 + 校验（`contracts.py`）

统一外壳：`{"accepted": bool, "data": {...}}`；`accepted:false` = 拒绝（记 `rejected`）。

| 任务 | 合法 `data` |
|---|---|
| bootstrap 主阶段 | `{fact:{description}, complete:{description}}`（两者必填） |
| bootstrap 收尾 | `{fact:{description}}`（禁带 complete） |
| reason | `{complete:{from,description}}` 或 `{intent:{from,description}}` 或 `{}` |
| explore | `{description}`（客观结论，禁「我拒绝」类文本） |

校验规则（照搬）：`complete` 与 `intent` 不能共存；`intent.from` 只能取合法 fact id；`open_intents` 为空且无 `complete` 时**必须**返回 `intent`。

## 8. worker driver 抽象（`workers/base.py` + `adapters/`）

统一接口：

- `check_health(worker, timeout)` — 进程内 HTTP 探活（验证 base_url/key/model 可用）
- `prepare_session()` — 预生成 session id（seed 型）
- `build_execute(worker, prompt, session)` → argv
- `extract_session(session, stdout, stderr)` — 正则从 stderr 抠 session id
- `build_conclude(...)` — 双阶段收尾，复用同 session
- `supports_conclude()` — 是否支持双阶段
- `extract_response_text(stdout, stderr)` — 从 stdout 的 JSON 事件流里取 assistant 文本
- `local_binary()` — local 模式下探测宿主 CLI

drivers：`claudecode` / `codex` / `pi` / `mock`。**`pi` 驱动（`adapters/pi.py`）就是本项目 worker 的直接参照**：local 模式下 spawn `pi --mode json --no-* --tools read,write,edit,bash,grep,find,ls -p <prompt>`。

## 9. 协议 API（`protocol/client.py`）

| 方法 | 用途 |
|---|---|
| `GET /projects` | 项目摘要（含 fact/intent/hint 计数） |
| `GET /projects/{id}` | 详情（完整图） |
| `GET /projects/{id}/export?format=yaml` | 图快照（喂 prompt 的 `{graph_yaml}`） |
| `POST /projects/{id}/intents` | 建 intent |
| `POST .../intents/{id}/heartbeat` | 认领 + 周期心跳 |
| `POST .../intents/{id}/conclude` | 写 fact、结论落定 intent |
| `POST .../intents/{id}/release` | 放弃本次尝试 |
| `POST .../reason/claim\|heartbeat\|release` | 项目级 reason lease |
| `POST /projects/{id}/complete` | 标记项目完成（带 fact id 列表） |

## 10. 移植到 cairn-pi 的裁剪映射

| Cairn 原语 | 精简版 cairn-pi 处理 |
|---|---|
| Server（HTTP + SQLite + 多项目） | 扩展内存态 + `.cairn/board.json`（单项目） |
| heartbeat / claim / release lease | **砍**（单进程、无竞争，不需要租约） |
| ContainerManager（Docker） | **砍**（local 模式，worker 直接在本机跑） |
| 健康检查 | **砍**（复用宿主 pi 自身配置，等同 Cairn 的 local 模式） |
| 多 worker 并发 + 选择算法 | **砍**（单 worker，选择逻辑退化为直接派发） |
| reason 去重检查点 | **保留**（本地 `{fact_count, hint_count, open_intent_count}`） |
| 双阶段 conclude fallback | **砍**（精简版：超时/解析失败直接记 failed，不重试收尾） |
| 三任务 + 输出契约 + prompt 渲染 | **保留**（照搬，改开发场景措辞） |
| worker = spawn `pi --mode json` | **保留**（就是 cairn-pi 的 worker 启动方式） |
| `extract_response_text`（JSON 事件流解析） | **保留**（解析 pi 子进程 stdout） |
| `extract_json_object`（抠 JSON 对象） | **保留**（TypeScript 实现） |

**精简版循环**（无 lease / 无并发 / 单项目，见 `DESIGN.md` §5）：

```text
start(goal):
  board = {origin, goal, facts:[origin,goal], intents:[], hints:[]}
  bootstrap → 成功则完成，失败则写 fact 继续
  loop(预算内):
    reason → complete 则结束 / intents 入列 / 空则卡死退出
    explore(一条 intent) → 写 fact，intent 置 done
```
