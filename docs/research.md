# 上游研究与迁移设计

研究时间：2026-11-02。参考 README，未逐个审计上游所有角色/脚本，也未复制上游代码。
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
