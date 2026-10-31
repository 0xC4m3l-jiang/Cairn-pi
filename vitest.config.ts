import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // 只跑本包的测试；demo/ 下的 node:test 用例属于对比实验，不归 vitest 管。
    include: ["tests/**/*.test.ts"],
  },
});
