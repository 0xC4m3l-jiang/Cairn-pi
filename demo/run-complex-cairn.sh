#!/usr/bin/env bash
# 复杂任务 · B 组：加载 cairn-pi 包，走节点图流程。
set -uo pipefail

PKG="$(cd "$(dirname "$0")/.." && pwd)"
WORK=/tmp/cairn-demo-complex-treatment
SESS=/tmp/cairn-demo-complex-treatment-sessions   # 单独存放本轮的 pi session，用于统计 token

rm -rf "$WORK" "$WORK.pristine"
rm -rf "$SESS"
cp -R "$PKG/demo/requirement-complex" "$WORK"
cp -R "$WORK" "$WORK.pristine"

PROMPT="$(cat "$PKG/demo/requirement-complex/REQ.md")

补充要求：请用 cairn-pi 的节点图流程完成，不要直接写代码收工：
1) cairn_map_write 建图，按模块（books/members/loans/reports）拆成节点，注意 loans 依赖 books+members、reports 依赖三者
2) 逐节点：cairn_node_claim → 改代码 → cairn_node_submit → cairn_node_verify(run=true)
3) 全部完成后 /cairn integrate 和 /cairn report，然后停止"

START=$(date +%s)
( cd "$WORK" && env -u PI_PACKAGE_DIR pi --session-dir "$SESS" -e "$PKG" -p "$PROMPT" )
END=$(date +%s)

echo "── B 组（cairn-pi，复杂任务）──"
echo "elapsed=$((END - START))s"
echo "── npm test ──"
( cd "$WORK" && npm test ) && echo "TEST=PASS" || echo "TEST=FAIL"
echo "── 改动文件 ──"
diff -rq "$WORK.pristine" "$WORK" || true
echo "── 测试文件指纹 ──"
md5 -q "$WORK.pristine/tests/"*.test.mjs "$WORK/tests/"*.test.mjs 2>/dev/null || true
echo "── 黑板状态 ──"
if [ -f "$WORK/.cairn/board.json" ]; then
  node -e '
    const b = require("'"$WORK"'/.cairn/board.json");
    console.log("nodes:", b.nodes.map(n => `${n.id}:${n.status}`).join(" "));
    console.log("events:", b.events.map(e => e.kind).join(","));
    console.log("integrate:", b.integrate ? Object.entries(b.integrate.levels).map(([k,v])=>`${k}=${v.exit}`).join(" ") : "无");
  '
else
  echo "无 board.json"
fi
echo "── token 用量 ──"
node "$PKG/demo/token-usage.mjs" "$SESS" --label="B cairn-pi（复杂）"
