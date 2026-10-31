# 需求：事件溯源库存与订单系统

5 个模块。**append-only 事件日志是唯一事实来源**，其余模块是投影或读模型。
全部逻辑放在 `src/`，测试已写好（`tests/*.test.mjs`），**测试文件不可修改**。

## 模块与职责

| 模块 | 文件 | 工厂 | 职责 |
|---|---|---|---|
| events | `src/events.mjs` | `createEventLog()` | 只追加事件日志 |
| inventory | `src/inventory.mjs` | `createInventory(eventLog)` | 库存投影，写操作落事件 |
| orders | `src/orders.mjs` | `createOrders(eventLog, inventory)` | 下单/取消，幂等，跨 inventory |
| snapshots | `src/snapshots.mjs` | `createSnapshots(eventLog)` | 快照、增量读取、重放 |
| reports | `src/reports.mjs` | `createReports(eventLog, inventory, orders)` | 汇总与审计视图 |

依赖方向：`inventory` 消费 `eventLog`；`orders` 消费二者；`reports` 消费三者。
每个工厂返回**独立状态**的对象。所有写操作都必须向 `eventLog` 追加事件。

## R1 事件日志（createEventLog）

返回 `{ append, all, byType, size }`：

- `append(type, payload)` 返回 `{ seq, type, payload, at }`
  - `seq` 从 1 开始单调递增且唯一；`at` 为 ISO 字符串
  - `type` 为空或全空白 → 抛错，信息含 `type`
- `all()` 按 `seq` 升序返回**浅拷贝**：修改返回的数组或其中对象不得影响日志内部
- `byType(type)` 同上，只返回该类型
- `size()` 返回事件条数

## R2 库存（createInventory(eventLog)）

返回 `{ restock, reserve, release, stock, levels }`：

- `restock(sku, qty)`：`qty` 必须是正整数，否则抛错含 `quantity`；成功后该 sku 库存增加
- `reserve(sku, qty)`：`qty` 正整数；**库存不足抛错含 `stock`**；足够则减少
- `release(sku, qty)`：`qty` 正整数；归还库存
- `stock(sku)` 返回当前数量，未知 sku 返回 `0`
- `levels()` 返回 `{ [sku]: qty }` 的**副本**，修改不影响内部
- 三个写操作都必须 `append` 一个事件

## R3 订单（createOrders(eventLog, inventory)）

返回 `{ placeOrder, cancelOrder, getOrder, listOrders }`：

- `placeOrder({ sku, qty, key })` 返回 `{ id, sku, qty, status: "placed", key }`
  - `qty` 正整数，否则抛错含 `quantity`
  - 库存不足抛错含 `stock`，且**库存不得变化**（原子性）
  - **幂等**：同一个 `key` 再次调用返回同一订单（同 `id`），且**不新增事件、不重复扣库存**
  - 不同 `key` 生成新 `id`（从 1 自增）
- `cancelOrder(orderId)` 返回更新后的订单，`status` 变为 `"cancelled"`，并**释放库存**
  - 订单不存在 → 抛错含 `order`；已取消 → 抛错含 `cancelled`
- `getOrder(id)` 返回订单或 `undefined`
- `listOrders()` 按创建顺序返回浅拷贝

## R4 快照（createSnapshots(eventLog)）

返回 `{ capture, since, rebuild }`：

- `capture()` 返回 `{ seq, at }`，`seq` 为当前事件条数
- `since(seq)` 返回 `seq` 之后的事件（即 `event.seq > seq`），浅拷贝
- `rebuild(reducer, initial)` 把所有事件依次喂给 `reducer`，返回累加结果
  （`reducer(acc, event)` 形式）

## R5 报表（createReports(eventLog, inventory, orders)）

返回 `{ summary, auditTrail }`：

- `summary()` 返回 `{ events, orders, placed, cancelled, skus, totalStock }`
  - `orders` 为订单总数；`placed` / `cancelled` 按 status 计数
  - `skus` 为有库存记录的 sku 数量；`totalStock` 为 `levels()` 数值之和
- `auditTrail()` 按 `seq` 升序返回 `[{ seq, type }]`，长度等于事件条数

## 约束

- 只改 `src/` 下的实现文件
- **不要修改 `tests/` 下的任何文件**
- 不引入任何运行时依赖（只用 Node 内置能力）
- `npm test` 必须通过
