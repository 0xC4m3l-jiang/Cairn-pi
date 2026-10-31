/**
 * 从 pi 的 session JSONL 里累计 token 用量与成本。
 *
 * 用途：A/B 实验要比较「同一条需求，两条路线各烧多少 token」。
 * 每个 assistant 消息自带 usage（input/output/cacheRead/cacheWrite/reasoning/totalTokens/cost），
 * 逐条累加即为本次运行的真实消耗。按消息 id 去重，避免同一消息被重复写入。
 *
 * 纯函数部分（parseSessionText）不碰文件系统，便于单测。
 */

const COUNTERS = ["input", "output", "cacheRead", "cacheWrite", "reasoning", "totalTokens"];

function num(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function emptyCounters() {
  const out = { assistantMessages: 0, cost: 0 };
  for (const key of COUNTERS) out[key] = 0;
  return out;
}

/** cost 有两种形态：原始 usage 的 `cost.total`，或已累加计数器里的 `cost` 数字。 */
function costOf(usage) {
  const cost = usage?.cost;
  if (typeof cost === "number") return num(cost);
  return num(cost?.total);
}

function addInto(target, usage) {
  for (const key of COUNTERS) target[key] += num(usage[key]);
  target.cost += costOf(usage);
}

/** 解析单个 session 文件的文本内容。 */
export function parseSessionText(text) {
  const seen = new Set();
  const total = emptyCounters();
  const byModel = {};
  let malformed = 0;

  for (const line of String(text).split("\n")) {
    if (line.trim() === "") continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      malformed += 1;
      continue;
    }
    const message = record?.message;
    if (!message || message.role !== "assistant" || !message.usage) continue;

    const id = record.id;
    if (typeof id === "string") {
      if (seen.has(id)) continue;
      seen.add(id);
    }

    total.assistantMessages += 1;
    addInto(total, message.usage);

    const model = typeof message.model === "string" && message.model !== "" ? message.model : "unknown";
    byModel[model] ??= emptyCounters();
    byModel[model].assistantMessages += 1;
    addInto(byModel[model], message.usage);
  }

  return { assistantMessages: total.assistantMessages, malformed, usage: total, byModel };
}

/** 合并多个文件的解析结果。 */
export function mergeSummaries(summaries) {
  const total = emptyCounters();
  const byModel = {};
  let malformed = 0;
  for (const summary of summaries) {
    total.assistantMessages += summary.assistantMessages;
    malformed += summary.malformed;
    addInto(total, summary.usage);
    for (const [model, counters] of Object.entries(summary.byModel)) {
      byModel[model] ??= emptyCounters();
      const slot = byModel[model];
      slot.assistantMessages += counters.assistantMessages;
      addInto(slot, counters);
    }
  }
  return { assistantMessages: total.assistantMessages, malformed, usage: total, byModel };
}

/** 递归读取目录下所有 .jsonl 并汇总。 */
export async function summarizeSessionDir(dir) {
  const { readdir, readFile } = await import("node:fs/promises");
  const { join } = await import("node:path");

  const files = [];
  const walk = async (current) => {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile() && entry.name.endsWith(".jsonl")) files.push(full);
    }
  };
  await walk(dir);

  const summaries = [];
  for (const file of files) summaries.push(parseSessionText(await readFile(file, "utf8")));
  return { files: files.length, ...mergeSummaries(summaries) };
}

/** 打印成一行可粘贴的表格行。 */
export function formatRow(label, summary) {
  const u = summary.usage;
  const pad = (n) => String(Math.round(n)).padStart(9);
  return [
    label.padEnd(12),
    pad(u.input),
    pad(u.output),
    pad(u.cacheRead),
    pad(u.totalTokens),
    u.cost.toFixed(4).padStart(10),
  ].join("  ");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const label = args.find((arg) => arg.startsWith("--label="))?.slice("--label=".length) ?? "total";
  const dir = args.find((arg) => !arg.startsWith("--"));
  if (!dir) {
    console.error("用法：node demo/token-usage.mjs <session-dir> [--json] [--label=名称]");
    process.exit(2);
  }
  const summary = await summarizeSessionDir(dir);
  if (asJson) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(
      ["组".padEnd(12), "input".padStart(9), "output".padStart(9), "cacheRead".padStart(9), "total".padStart(9), "cost($)".padStart(10)].join("  "),
    );
    console.log(formatRow(label, summary));
    for (const [model, counters] of Object.entries(summary.byModel)) {
      console.log(formatRow(`  ${model}`, { usage: counters }));
    }
    console.log(`  （session 文件 ${summary.files} 个，assistant 消息 ${summary.assistantMessages} 条）`);
  }
}
