# Model Optimization Studio

面向 Three.js 编辑器、数字孪生设备模型的本地 glTF/GLB 优化项目。借鉴 Claude-Code-Game-Studios 的角色分工和验收流程，配套实际可运行的 Node.js 优化工具。无需 AI API Key；可独立命令行运行，也可交给 Claude Code / Codex 操作。

## 快速开始

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

视觉验收必须在相同视角、环境、曝光、tone mapping 和分辨率下检查，尤其关注六面轮廓、细管线、法线贴图、透明材质、动画与设备点击绑定。当前不包含可视化比较器和截图自动评分，所有报告默认 `visualReview: pending`。

已实现：分析、accessor 去重、静态减面、PNG/JPEG 缩小、Meshopt、候选择优、输出验证、结构契约、报告。未实现：Blender 自动重拓扑、隐藏面清理、UV 重展、烘焙、KTX2 编码、LOD、自动美术修复。模型实际能优化多少需提供模型后运行。

上游研究和迁移依据见 docs/research.md。本项目是独立实现，未复制上游代码。
