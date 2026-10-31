# 项目适配面 —— 开发规范（技能 `dev-loop`）读取本文件
# 字段含义见技能 §1；改路径或命令时同一轮内更新本文件。

enabled: true
language: 中文

# 需求 / 规则 / 约束的权威位置（技能把它们当"依据"，不得擅自改写）
spec_sources:
  - README.md

# 文档分层：role 取 spec（必须遵守）或 reference（仅供参考）；没有分层体系就删掉本节
doc_layers: []

# 每轮的变更包与变更日志
change_package_dir: docs/plans/
change_log: docs/Log.md

# 一键验证命令（必须真实存在且跑得通）
verify_cmd: npm run verify

# 追溯检查命令（可选；留空则按技能 §5 人工核）
trace_cmd: ""

# 说明：追溯检查应当覆盖技能 §5 的四类 —— 悬空引用 · 孤儿文档 · 过期状态标记 · 过期豁免

# 迭代期快速验证命令（可选）
iteration_cmds:
  - npm test

# 需求/规则编号体系（没有就留空）
numbering: ""
