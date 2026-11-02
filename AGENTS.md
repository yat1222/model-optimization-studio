# Model Optimization Studio：美化优先任务入口

## 用户说“美化/好看/材质/Blender”时

美化是首要目标，压缩只是后处理。先读 `art/ART_BIBLE.md`，按 `.claude/commands/beautify.md` 的基线→美术方案→Blender 执行→同条件截图审阅→最多三轮修正流程推进。Codex 也按此流程工作，不需要 Claude Code 插件。

执行入口：`npm run beautify -- "input/model.glb" --plan "art/<asset>-v1.json"`，运行程序为 Blender 4.5 LTS，可用 `--blender` 或 `BLENDER_BIN` 指定。

必须实际运行 Blender，不能只写提示词；无法启动时说明阻塞。命令不调用 LLM，宿主 AI 负责看图、制定方案和迭代，不能将一键参数处理说成自动审美。默认只处理静态模型；动画/skin/morph 和未验收扩展必须停止，不静默降级。

不改业务节点名、层级、变换与 extras；只在原模型副本上工作。美化可能增面、增加体积。`review.json` 独立记录真实视觉审阅；CLI 成功只代表执行/结构/格式通过。

本节优先于下面的压缩规则。倒角、法线和 PBR 材质修改属于美化授权；UV/烘焙/重拓扑等需技术美术实际扩展并测试，当前没有这些自动算法。

## 用户仅要求轻量化/压缩时

用户提供 glTF/GLB 后，应执行优化并交付真实文件和报告，不要仅给建议。

## 执行流程
1. 阅读 README.md、project.json；确认模型路径及其完整资源目录。
2. 默认执行 `npm run optimize -- "input/model.glb"`。用户明确追求压缩率或授权减面后才使用 `--preset auto`；对明确档位使用 balanced/compact。
3. 解析该次运行的 report.json。若失败，定位资源缺失、未知扩展、非法 glTF，保留原文件并说明阻塞原因。不能把失败候选当成成功结果。
4. 解释 selected、真实大小变化、面数和纹理变化、跳过操作、验证告警。baseline 是未优化回退，不能声称已经压缩。
5. 若有可用的渲染工具，以同一相机、环境、tone mapping 和分辨率比较原始/结果的至少六个方向及关键细节；检查动画、透明材质、法线、UV、设备拾取和业务绑定。没有实际观察时，必须保留 visualReview=pending。
6. 若视觉质量不达标，降档到 safe，再执行验证。用户提出文件大小目标时，不得为了达到目标隐瞒损伤或无限迭代；说明本次能达到的结果。
7. 返回该次输出目录中的 optimized.glb、report.json、report.md。原文件不可覆盖。

## 硬约束
- 不 flatten/join，不改节点名、父子关系、变换、extras，不合并材质身份；设备节点可能用于点击、定位和数据绑定。
- optimize 不进行隐藏面删除、自动重拓扑、UV 重展、贴图烘焙、KTX2 转码或 LOD，当前代码没有实现这些能力。
- 蒙皮/morph 模型整模跳过减面。动画轨道不重采样。
- 不保证视觉无损、运行时帧率提升或达到固定压缩率。资源 primitives 不是实际 draw calls。
- meshopt 输出在 Three.js GLTFLoader 中需要 MeshoptDecoder；none 不新增几何压缩，但已有 KTX2/WebP 等扩展仍需要加载器支持。
- 不联网上传模型；缺少依赖时按 lockfile 安装。

## 角色参考
`.claude/agents/` 是 Claude Code 可识别的角色定义，不是常驻服务。Codex 按本文件执行相同流程。角色之间的调度由宿主 AI 决定，CLI 本身是确定性的本地算法管线，不调用 LLM，不要求 API Key。
