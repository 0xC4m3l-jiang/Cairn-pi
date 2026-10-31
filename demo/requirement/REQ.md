# 需求：迷你待办核心库

在 `src/todo.mjs` 中实现并导出 `createTodo()`，返回一个待办管理器对象。

## R1 新增

- `add(title)` 返回 `{ id, title, done: false }`
- `id` 从 1 开始自增，每次 `add` 加一
- `title` 为空或全是空白字符时抛错，错误信息包含 `title`

## R2 切换

- `toggle(id)` 翻转该条目的 `done` 并返回更新后的条目
- `id` 不存在时抛错，错误信息包含 `not found` 或 `unknown`

## R3 读取

- `list()` 按创建顺序返回条目数组（浅拷贝，外部改动不影响内部状态）
- `summary()` 返回字符串 `"<已完成数>/<总数> done"`，例如 `"1/3 done"`

## 约束

- 只改 `src/todo.mjs`
- **不要修改 `tests/todo.test.mjs`**
- 不引入任何运行时依赖
- `npm test` 必须通过
