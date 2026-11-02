# Model Optimization Studio

首先读取并遵守根目录 AGENTS.md，然后处理用户模型。
根目录 project.json 是优化档位参数的实际来源。
材质数值参考 docs/material-parameter-reference.md 和 art/material-parameters.json；使用 material:reference 查询，保留当前 Blender CLI 后端，不照搬上游 MCP 路由。
可参考 .claude/agents 中的分工；无需为简单模型启动多个角色。
美化需求优先按 art/ART_BIBLE.md 与 .claude/commands/beautify.md 调用 Blender，先美术方案再执行、看图、迭代。可使用 /beautify input/model.glb。
不要只规划：运行 CLI，检查结果，交付文件。仅轻量化需求且未授权有损处理时使用 safe。

