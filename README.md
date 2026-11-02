# Model Optimization Studio

## Material Maker 预设材质分支（v0.3）

新增“Codex 选预设与参数 → Material Maker 1.8 生成 PBR 贴图 → Blender 应用到指定部件 → 导出 GLB 并渲染审阅”的流程。包含木纹、大理石、砖墙、岩石、锈蚀金属、花纹金属六种官方示例，支持基础 UV 生成、贴图重复尺度与法线强度控制。

```bash
npm run materials -- list
npm run materials -- inspect wood
npm run beauty:demo
npm run beautify -- input/beauty-demo.glb --plan art/material-maker-demo.json --material-maker /path/to/material_maker
```

需要另行安装 Material Maker 1.8 并具备可用图形计算环境，Blender 要求 4.5 LTS。Codex 的自动选材与看图迭代说明、方案格式、许可和限制见 [Material Maker 集成说明](docs/material-maker.md)。CLI 不另行调用 AI API。

面向 Three.js / 数字孪生资产的 **Blender 美化工作室**。v0.2 将美术质量放在首位：参考 Claude-Code-Game-Studios 的美术指导、技术美术与证据验收方法，由 Claude Code / Codex 制定逐模型方案，真实调用 Blender 执行，再看图迭代。保留原来的 Node.js 轻量化工具。

## 美化模型（主流程）

需要 Node.js 22+ 与 **Blender 4.5 LTS**，无需安装 Blender 插件或开通额外模型 API。CLI 本身不调用 AI：美术决策、图片审阅与迭代由运行它的 Claude Code / Codex 完成。

```bash
npm ci
# 读取节点和材质，供 AI 制定逐部件方案
npm run inspect -- input/model.glb
# Blender 已在 PATH 时
npm run beautify -- input/model.glb --plan art/industrial.json

# macOS 示例（Windows 可用 --blender "C:\Program Files\Blender Foundation\Blender 4.5\blender.exe"）
npm run beautify -- input/model.glb --blender /Applications/Blender.app/Contents/MacOS/Blender --plan art/industrial.json

# 可重现的材质美化示例
npm run beauty:demo
npm run beautify -- input/beauty-demo.glb --plan art/demo.json
```

在 Claude Code 中输入 `/beautify input/model.glb`，或给 Claude Code / Codex：

> 按 AGENTS.md 和 art/ART_BIBLE.md，使用 Blender 美化 input/model.glb。重点提升材质、边缘高光、表面质感与色彩层级，保持设备名称、层级、变换和 extras。先渲染原模型、制定逐部件方案，再执行并实际查看六向前后对比；最多迭代三轮，交付最佳 GLB、blend 和审阅记录。暂不减面。

默认工业风格只是起点，**没有替所有模型预先决定配色或物理材质**。宿主 AI 应根据输入与参考填写 `art/<asset>-v1.json` 和对应的说明，再运行；没有素材参考时记录假设并推进。可用的参数格式见 `art/demo.json`，美术标准和评分方式见 [ART_BIBLE](art/ART_BIBLE.md)。

### 实际执行内容

- 逐材质、可逐节点设置 PBR 颜色、粗糙度、金属度；颜色值为 sRGB 0–1，写入 Blender 时转线性。贴图输入默认保留；只有该规则显式写 `replaceTextures: true` 才解除相应输入连接。原 UV 与法线贴图不主动重做。
- 静态封闭流形网格的小倒角、角度锐边、加权法线，改善真实几何的边缘高光；不做减面。开放网格、非均匀/负缩放、超过 20 万面的对象跳过自动倒角并记录原因，不为了倒角改变设备变换。
- 固定 Cycles CPU 三点棚灯、地面、AgX、曝光与相机；六个正交方向加 hero 成对渲染（底视图隐藏展示地面）。after 图来自导出 GLB 的重新导入，避免仅 Blender 内看起来正确。
- 导出后检查 glTF 有效性及节点名称、父子关系、局部矩阵（浮点容差）、extras 与网格绑定存在性；不要求 Blender 保留节点数组顺序、材质名称/身份或原始字节。

输入当前限定为单场景、节点名非空且唯一的静态三角形 glTF/GLB；拒绝动画、skin、morph、源摄像机、场景外节点。扩展往返尚未全面验收，当前美化只接受 Meshopt/Draco 压缩与 mesh quantization，先解码后交给 Blender；其他扩展明确报错，避免静默丢失。原 `optimize` 对动画等输入的支持不变。

### 每轮交付

输出到全新 `output/beauty-XXXXXX/`：

| 文件 | 内容 |
|---|---|
| `beautified.glb` | 格式与节点契约通过后的美化候选，供 Three.js 使用 |
| `beautified.blend` | 美化模型与展示棚灯、地面、相机，贴图打包 |
| `before-*.png` / `after-*.png` | 相同条件的前后对比 |
| `comparison.html` | 可在本地浏览器打开的并排图册 |
| `art-plan.json` | 本轮实际执行参数 |
| `report.json` / `blender-report.json` / `blender.log` | 验证、操作/跳过清单与运行日志 |
| `review.json` | 初始 pending，由实际看图的宿主 AI/人补充意见、证据与下一轮修改 |
| `source.glb` / `candidate.glb` | 解码原输入与原始导出，保留排查证据 |

每一轮必须回到原始输入，用新版方案重跑，避免倒角反复叠加。CLI 成功状态为 `needs-visual-review`，**不会自动宣称审美通过**。`.blend` 的棚灯、地面和 AgX 不导出到 GLB；Three.js 仍需自行设置环境光照、阴影与 tone mapping。模型的几何和材质改动才会带入 GLB，美化可能增加体积和面数。

自动重拓扑、UV 重展/烘焙、缺失部件重建、磨损纹理目前没有现成执行器；技术美术可针对具体模型扩展 Blender Python 并验证，不能靠提示词保证任意资产“彻底变好看”。纯静态网站不能直接运行本地 Blender：网页版需连接本机任务服务或运行 Blender 的后端，此仓库暂未提供该服务。

## 轻量化（保留的辅助流程）

安装 Node.js 22 或更新版本，然后：

```bash
npm ci
# 把 GLB 放到 input；glTF 则放入包含 bin/贴图的完整文件夹
npm run optimize -- input/model.glb
# 已授权减面/贴图缩小后，自动尝试多个档位并择小
npm run optimize -- input/model.glb --preset auto
# 不新增几何压缩，减少客户端解码器配置
npm run optimize -- input/model.gltf --compression none
```

每次生成新的 `output/run-XXXXXX/`，包含 `optimized.glb`、`report.json`、`report.md`。不会覆盖输入或历史结果；失败退出码非零。支持空格路径，请加双引号。支持 Windows/macOS/Linux（取决于 sharp 预编译包支持）。

```bash
npm run demo
npm run optimize -- input/demo.glb --preset auto
npm test
```

## 档位

| 档位 | 目标三角形保留比例 | 减面误差上限 | PNG/JPEG 最大边长 |
|---|---:|---:|---:|
| safe（默认） | 100% | 不减面 | 不处理 |
| balanced | 65% | 0.001 | 2048 |
| compact | 35% | 0.005 | 1024 |
| auto | 比较上述三档 | 按候选档位 | 按候选档位 |

参数来自 project.json。误差由 meshoptimizer 定义，不能理解为屏幕像素误差或直接的视觉差异百分比。边界锁定与误差限制可能导致面数达不到目标。auto 以通过结构/格式检查后文件最小为准，**会允许视觉有损，不自动判断美术质量**。

safe 只做 accessor 去重、无自动量化的 Meshopt 编码和 GLB 重写；不主动改几何坐标/动画。文件重写和支持扩展往返仍需业务验收，不能视作逐字节保留。若候选比规范化原始 GLB 更大，交付 baseline，报告会说明没有缩小。源大小包括 glTF JSON 与去重后的外部资源总大小，不等同于单个 JSON 大小。

保留节点数量/顺序、名称、父子关系、场景入口、节点变换、节点 extras、动画通道目标和蒙皮关节关系，并在序列化后比较契约。没有合并节点、材质或贴图身份。检测到 skin/morph 时整模跳过减面。贴图保留原格式，仅处理 PNG/JPEG；JPEG 重编码和贴图缩小有损。KTX2/WebP 等已有贴图不主动转换。

模型输入限定资源位于模型文件夹内，不自动下载远程 URI；不支持的扩展直接报错，避免静默删除。缺少 bin/贴图请补齐后重跑。输入非法时停止，不自动“修复”。大模型会多次解码并占较多内存，当前为串行 CLI，无队列/服务器/上传 UI。

## 让 AI 操作

在解压目录启动 Claude Code 或 Codex，输入：

> 请按 AGENTS.md 优化 input/园区/model.gltf。保持设备名称、层级、extras 和动画，先使用 safe。交付优化 GLB 和报告；没有实际渲染时把视觉验收标为待复核。

若想减面，明确补充“允许减面与贴图缩小，使用 auto”。Claude Code 可识别 `.claude/agents/` 中的角色；Codex 使用根 AGENTS.md。当前未安装全局技能、未配置特殊权限或 Hooks。角色定义供宿主选择使用，CLI 不自动启动 AI 角色。

## Three.js 加载 Meshopt 结果

在现有项目中使用与你的 Three.js 同版本的 examples 模块：

```js
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const gltf = await loader.loadAsync('/optimized.glb');
scene.add(gltf.scene);
```

已有 KTX2 等扩展仍需对应解码器。输出不强制转换所有贴图格式。

## 验收与范围

report.json 包含前后节点、网格、资源三角形/顶点、primitive、材质、贴图、动画、蒙皮统计，以及候选参数、Validator 结果、失败原因和结构比较。三角形为网格资源统计，不重复计算实例；primitive 不能当作运行时 draw calls，未测量 FPS/显存/加载耗时。Validator 的不支持扩展提示仍需结合实际加载器判断。

视觉验收必须在相同视角、环境、曝光、tone mapping 和分辨率下检查，尤其关注六面轮廓、细管线、法线贴图、透明材质、动画与设备点击绑定。轻量化命令不包含可视化比较器；美化命令提供 Blender 渲染对比图册，但不自动进行审美评分。所有 CLI 报告默认 `visualReview: pending`。

轻量化已实现：分析、accessor 去重、静态减面、PNG/JPEG 缩小、Meshopt、候选择优、输出验证、结构契约、报告。美化能力和边界见前面的主流程。模型实际效果需提供模型后执行并审阅。

上游研究和迁移依据见 docs/research.md。本项目是独立实现，未复制上游代码。
