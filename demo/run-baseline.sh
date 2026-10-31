#!/usr/bin/env bash
# A 组：原生 pi，不加载任何包。
set -uo pipefail

PKG="$(cd "$(dirname "$0")/.." && pwd)"
WORK=/tmp/cairn-demo-baseline

rm -rf "$WORK" "$WORK.pristine"
cp -R "$PKG/demo/requirement" "$WORK"
cp -R "$WORK" "$WORK.pristine"

START=$(date +%s)
( cd "$WORK" && env -u PI_PACKAGE_DIR pi -p "$(cat "$PKG/demo/requirement/REQ.md")" )
END=$(date +%s)

echo "── A 组（基线）──"
echo "elapsed=$((END - START))s"
echo "── npm test ──"
( cd "$WORK" && npm test ) && echo "TEST=PASS" || echo "TEST=FAIL"
echo "── 改动文件 ──"
diff -rq "$WORK.pristine" "$WORK" || true
echo "── 测试文件指纹 ──"
md5 -q "$WORK.pristine/tests/todo.test.mjs" "$WORK/tests/todo.test.mjs" 2>/dev/null || true
