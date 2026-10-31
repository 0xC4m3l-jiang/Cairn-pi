#!/usr/bin/env bash
# 高难任务 · B 组：加载 cairn-pi 包，走节点图流程。
set -uo pipefail

PKG="$(cd "$(dirname "$0")/.." && pwd)"
WORK=/tmp/cairn-hard-treatment

rm -rf "$WORK" "$WORK.pristine"
cp -R "$PKG/demo/requirement-hard" "$WORK"
cp -R "$WORK" "$WORK.pristine"

PROMPT="$(cat "$PKG/demo/requirement-hard/REQ.md")

补充要求：请用 cairn-pi 的节点图流程完成，不要直接写代码收工：
1) cairn_map_write 建图，按模块（events/inventory/orders/snapshots/reports）拆成节点，注意依赖方向：inventory 依赖 events，orders 依赖 inventory，reports 依赖三者，snapshots 依赖 events
2) 每个节点必须声明 probes（如 spec-probes/<module>.spec.mjs），并把该文件写进 touches；probes 里放 REQ 写了但 tests/ 没覆盖的边界断言（未知键、原型链键 toString/constructor/__proto__、空值、非正整数、重复调用、返回副本、事件顺序）
3) 逐节点：cairn_node_claim → 改代码 + 写 spec-probes → cairn_node_submit → cairn_node_verify(run=true)
4) 全部完成后 /cairn integrate 和 /cairn report，然后停止"

START=$(date +%s)
( cd "$WORK" && env -u PI_PACKAGE_DIR pi -e "$PKG" -p "$PROMPT" )
END=$(date +%s)

echo "── B 组（cairn-pi，高难任务）──"
echo "elapsed=$((END - START))s"
echo "── npm test ──"
( cd "$WORK" && npm test ) && echo "TEST=PASS" || echo "TEST=FAIL"
echo "── 改动文件 ──"
diff -rq "$WORK.pristine" "$WORK" || true
echo "── 测试文件指纹 ──"
md5 -q "$WORK.pristine/tests/"*.test.mjs "$WORK/tests/"*.test.mjs 2>/dev/null || true
echo "── 代码行数 ──"
wc -l "$WORK/src/"*.mjs 2>/dev/null || true
echo "── 黑板状态 ──"
if [ -f "$WORK/.cairn/board.json" ]; then
  node -e '
    const b = require("'"$WORK"'/.cairn/board.json");
    console.log("nodes:", b.nodes.map(n => `${n.id}:${n.status}:${n.module}`).join(" "));
    console.log("events:", b.events.map(e => e.kind).join(","));
    console.log("integrate:", b.integrate ? Object.entries(b.integrate.levels).map(([k,v])=>`${k}=${v.exit}`).join(" ") : "无");
    for (const n of b.nodes) {
      const f = n.findings.find(x => x.status === "confirmed");
      console.log("  " + n.id + " [" + n.module + "] " + n.title + " -> " + (f ? Object.entries(f.evidence.levels).map(([k,v])=>`${k}=${v.exit}`).join(" ") : "无证据"));
    }
  '
else
  echo "无 board.json"
fi
