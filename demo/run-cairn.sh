#!/usr/bin/env bash
# B 组：加载 cairn-pi 包，走节点图流程。
set -uo pipefail

PKG="$(cd "$(dirname "$0")/.." && pwd)"
WORK=/tmp/cairn-demo-treatment

rm -rf "$WORK" "$WORK.pristine"
cp -R "$PKG/demo/requirement" "$WORK"
cp -R "$WORK" "$WORK.pristine"

PROMPT="$(cat "$PKG/demo/requirement/REQ.md")

补充要求：请用 cairn-pi 的节点图流程完成，不要直接写代码收工：
1) cairn_map_write 建图，按模块拆成若干节点
2) 逐节点：cairn_node_claim → 改代码 → cairn_node_submit → cairn_node_verify(run=true)
3) 最后 /cairn integrate 和 /cairn report"

START=$(date +%s)
( cd "$WORK" && env -u PI_PACKAGE_DIR pi -e "$PKG" -p "$PROMPT" )
END=$(date +%s)

echo "── B 组（cairn-pi）──"
echo "elapsed=$((END - START))s"
echo "── npm test ──"
( cd "$WORK" && npm test ) && echo "TEST=PASS" || echo "TEST=FAIL"
echo "── 改动文件 ──"
diff -rq "$WORK.pristine" "$WORK" || true
echo "── 测试文件指纹 ──"
md5 -q "$WORK.pristine/tests/todo.test.mjs" "$WORK/tests/todo.test.mjs" 2>/dev/null || true
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
