#!/usr/bin/env bash
# 复杂任务 · A 组：原生 pi，不加载任何包。
set -uo pipefail

PKG="$(cd "$(dirname "$0")/.." && pwd)"
WORK=/tmp/cairn-demo-complex-baseline
SESS=/tmp/cairn-demo-complex-baseline-sessions   # 单独存放本轮的 pi session，用于统计 token

rm -rf "$WORK" "$WORK.pristine"
rm -rf "$SESS"
cp -R "$PKG/demo/requirement-complex" "$WORK"
cp -R "$WORK" "$WORK.pristine"

START=$(date +%s)
( cd "$WORK" && env -u PI_PACKAGE_DIR pi --session-dir "$SESS" -p "$(cat "$PKG/demo/requirement-complex/REQ.md")" )
END=$(date +%s)

echo "── A 组（原生 pi，复杂任务）──"
echo "elapsed=$((END - START))s"
echo "── npm test ──"
( cd "$WORK" && npm test ) && echo "TEST=PASS" || echo "TEST=FAIL"
echo "── 改动文件 ──"
diff -rq "$WORK.pristine" "$WORK" || true
echo "── 测试文件指纹 ──"
md5 -q "$WORK.pristine/tests/"*.test.mjs "$WORK/tests/"*.test.mjs 2>/dev/null || true
echo "── token 用量 ──"
node "$PKG/demo/token-usage.mjs" "$SESS" --label="A 原生 pi（复杂）"
