# 上游研究与迁移设计

研究时间：2026-11-02。v0.1 参考 README；v0.2 另读取 art-director、technical-artist 与 team-polish 定义，未审计上游全部文件，也未复制上游实现。
来源：https://github.com/Donchitos/Claude-Code-Game-Studios

原项目是 Claude Code 游戏开发工作室模板，不是模型压缩软件。README 描述了分层角色、工作流指令、统一 project.yaml、Hooks、路径规则及证据验收。与模型资产直接相关的入口包括 technical-artist、art-director、tools-programmer、performance-analyst、qa-tester，以及 asset-spec、asset-audit、perf-profile、team-polish。它们提供任务组织和专业提示，实际模型修改仍需外部工具。

本项目借鉴方法，独立实现 glTF 专用版本：

| 上游机制 | 本项目落地 |
|---|---|
| 分层角色 | 优化统筹、模型分析、执行、视觉验收四个角色 |
| project.yaml | 实际由管线读取的 project.json 档位参数 |
| 资产审计 | glTF Validator、扩展检查、资源统计 |
| 工作流 | AGENTS.md / CLAUDE.md 的执行流程 |
| 质量门槛 | 输出重新解码、结构契约、Validator、候选回退 |
| 视觉证据 | 保留待复核状态，要求实际渲染后才能声明通过 |

没有搬入整套游戏 GDD、剧情、冲刺或发布流程，也没有自动安装上游 Hooks。README 中的角色数量可能随版本变化，本项目不依赖这些数量。

算法参考：
- https://gltf-transform.dev/modules/core/classes/NodeIO
- https://gltf-transform.dev/modules/functions/functions/simplify
- https://gltf-transform.dev/modules/functions/functions/textureCompress
- https://github.com/KhronosGroup/glTF-Validator

减面基于 meshoptimizer 的误差约束，ratio 是目标保留比例。压缩率、视觉差异和实际帧率必须由具体模型实测。

## v0.2：美化优先

核对上游提交 `05ad7c8a5b8aa2aa86bbd3439ae7cf7295cac418` 的定义：

- [art-director](https://github.com/Donchitos/Claude-Code-Game-Studios/blob/05ad7c8a5b8aa2aa86bbd3439ae7cf7295cac418/.claude/agents/art-director.md)：风格手册、色彩、材质语言、灯光方向、视觉层级和资产标准。
- [technical-artist](https://github.com/Donchitos/Claude-Code-Game-Studios/blob/05ad7c8a5b8aa2aa86bbd3439ae7cf7295cac418/.claude/agents/technical-artist.md)：将美术方向落实为渲染/资产处理工具，并核对实际引擎版本。
- [team-polish](https://github.com/Donchitos/Claude-Code-Game-Studios/blob/05ad7c8a5b8aa2aa86bbd3439ae7cf7295cac418/.claude/skills/team-polish/SKILL.md)：分阶段评估、执行、质量检查、记录证据；不把未测量项伪装成通过。

这是工作流与专业判断框架，不是训练过的审美模型，也不附带 Blender 自动建模算法。本项目独立实现美化执行器，采用同样的方向→技术实现→证据审阅分工，保留源模型业务节点。美化效果由宿主 AI 或人看图判断，参数执行由 Blender 完成；不安装上游 hooks 或复制其审批策略。

对应实现为 `art/ART_BIBLE.md`、美术角色与 `/beautify` 命令、Node 调度器和 `blender/beautify.py`。Blender 版本限定 4.5 LTS：

- https://docs.blender.org/api/4.5/bpy.types.BevelModifier.html
- https://docs.blender.org/api/4.5/bpy.ops.export_scene.html

实际模型改动与棚拍表现分开记录；GLB 重导入再渲染，避免把只在源场景有效的修改当成最终效果。
