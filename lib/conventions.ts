/**
 * 工程约定：注入到每个节点的 brief。
 *
 * 存在理由：节点 subagent 只拿到 requirement / acceptance / tests / touches 时，
 * 会写出「测试全绿但规格违规」的代码（实测：`stock("toString")` 返回函数、
 * `byType` 解构即崩、`getOrder` 返回内部引用）。
 * 这些不是规格条款，是工程常识——必须显式给，不能指望 agent 自觉。
 */

export const ENGINEERING_CONVENTIONS: readonly string[] = [
  "键值容器用 Map，不要用普通对象下标：{}[key] 会命中原型链（如 stock(\"toString\") 返回函数而非 0）",
  "所有公开 API 返回对象/数组时返回副本；内部状态不得被调用方改穿",
  "不使用 this：用具名闭包函数并 return 成对象，保证方法可被解构后调用",
  "写操作顺序：先追加事件/日志，再改投影状态；事件日志是唯一事实来源",
  "原子性：多步写操作失败时不得留下半步状态（先校验，后落库）",
  "幂等表只在操作成功后才写入；失败重试不得被错误缓存挡住",
  "每处不变量（原子性 / 幂等 / 返回副本 / 事件顺序）上方写一行「为什么」注释",
  "边界枚举必须覆盖：未知键、原型链键（toString / constructor / __proto__）、空值、非正整数、重复调用",
  "输入校验器只实现一次并跨模块复用，不要在每个调用点重写一遍",
];

/** 渲染成注入用的文本块；extra 是项目自身的约定（来自 board.survey.conventions 或 AGENTS.md）。 */
export function renderConventions(extra: readonly string[] = []): string {
  const all = [...ENGINEERING_CONVENTIONS, ...extra.filter((item) => item.trim() !== "")];
  return ["工程约定（必须遵守，验收会查）：", ...all.map((item, index) => `${index + 1}. ${item}`)].join("\n");
}
