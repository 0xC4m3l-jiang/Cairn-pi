# 需求：迷你图书借阅系统

一个支持会员借书、还书、并出具统计报告的小型系统。四个模块，跨模块有调用边界，通过**工厂函数 + 依赖注入**组合。
全部逻辑放在 `src/` 下，测试已写好（`tests/*.test.mjs`），**测试文件不可修改**。

## 模块与职责

| 模块 | 文件 | 工厂 | 职责 |
|---|---|---|---|
| books | `src/books.mjs` | `createBooks()` | 图书建档、查询、可借状态 |
| members | `src/members.mjs` | `createMembers()` | 会员建档、查询 |
| loans | `src/loans.mjs` | `createLoans(books, members)` | 借书 / 还书，跨 books + members |
| reports | `src/reports.mjs` | `createReports(books, members, loans)` | 汇总统计 |

依赖注入方向：`loans` 消费 `books` 与 `members` 实例；`reports` 消费三者。每个工厂返回一个**独立状态**的对象。

## R1 图书（createBooks）

返回对象 `{ addBook, getBook, listBooks }`：

- `addBook({ title, author, isbn })` 返回 `{ id, title, author, isbn, available: true }`
- `id` 从 1 自增；`available` 恒为 `true`
- `title` 或 `author` 为空/全空白 → 抛错，错误信息分别含 `title` / `author`
- `isbn` 必须匹配 10 或 13 位数字（`/^\d{10}(\d{3})?$/`）→ 否则抛错，信息含 `isbn`
- `getBook(id)` 返回该书或 `undefined`
- `listBooks()` 按建档顺序返回浅拷贝数组

## R2 会员（createMembers）

返回对象 `{ addMember, getMember, listMembers }`：

- `addMember({ name, email })` 返回 `{ id, name, email, active: true }`
- `id` 从 1 自增；`active` 恒为 `true`
- `name` 为空 → 抛错含 `name`；`email` 不含 `@` → 抛错含 `email`
- `getMember(id)` 返回该会员或 `undefined`
- `listMembers()` 按建档顺序返回浅拷贝数组

## R3 借还（createLoans）

返回对象 `{ borrow, returnBook, listLoans }`：

- `borrow(memberId, bookId)` 返回 `{ id, memberId, bookId, dueAt, returnedAt: null }`
  - 会员不存在 → 抛错含 `member`；图书不存在 → 抛错含 `book`；图书已借出 → 抛错含 `available`
  - 借出成功即把该书 `available` 置 `false`
  - `dueAt` 为借出时刻 + 14 天的毫秒时间戳
- `returnBook(loanId)` 把该借阅 `returnedAt` 置为时间戳、该书 `available` 置回 `true`，返回更新后的借阅
  - 借阅不存在 → 抛错含 `loan`；已归还 → 抛错含 `returned`
- `listLoans()` 按借出顺序返回浅拷贝数组

## R4 统计（createReports）

返回对象 `{ report }`：

- `report()` 返回 `{ totalBooks, availableBooks, totalMembers, totalLoans, activeLoans }`
  - `totalBooks` / `totalMembers` 为总数
  - `availableBooks` 为 `available === true` 的图书数
  - `totalLoans` 为借阅总数，`activeLoans` 为 `returnedAt === null` 的数量

## 约束

- 只改 `src/` 下的实现文件
- **不要修改 `tests/` 下的任何文件**
- 不引入任何运行时依赖（只用 Node 内置能力）
- `npm test` 必须通过
