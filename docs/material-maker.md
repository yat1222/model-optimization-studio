# Codex × Material Maker：自动使用预设美化材质

本分支将 Material Maker 1.8 的程序材质作为 Blender 美化的贴图来源。Codex 根据模型、用户参考与美术规范选择预设和参数；本地工具执行真实导出、贴图连接与渲染。没有在 CLI 中另行调用 AI API，也不把关键词匹配说成视觉识别。

## 环境与流程

需要 Node.js 22+、Blender 4.5 LTS、[Material Maker 1.8](https://github.com/RodZill4/material-maker/releases/tag/1.8)。将应用可执行文件加入 PATH，或用 `MATERIAL_MAKER_BIN` / `--material-maker` 指定完整路径。macOS 指向应用包内的实际可执行文件，不是 `.app` 目录。

Material Maker 的程序贴图需要可用的图形计算设备/驱动；Linux 服务器可能还需显示服务与 Vulkan。**不要给它添加 `--headless` 并假定能生成贴图**：Godot 的空渲染器不能替代 GPU 计算。可使用本地桌面程序；服务器可提供一个可执行 wrapper，将同一组参数转发到配置好的图形环境。例如有 Vulkan 驱动的 Linux：

```sh
#!/bin/sh
exec xvfb-run -a /opt/material-maker/material_maker.x86_64 "$@"
```

wrapper 不是安装脚本；需要先自行具备相应的显示/图形依赖。没有可用渲染设备时导出应失败，不能用假贴图回退。

```bash
npm ci
npm run materials -- list
npm run materials -- list 木材
npm run materials -- inspect wood

# 独立导出，用于先看贴图再决定是否使用
npm run materials -- export wood --size 512 --material-maker /path/to/material_maker

# 完整模型美化示例
npm run beauty:demo
npm run beautify -- input/beauty-demo.glb --plan art/material-maker-demo.json --material-maker /path/to/material_maker --blender /path/to/blender
```

官方 CLI 参数依据为上游 `parse_args.gd`：`--export-material --target Blender --size N --output-dir DIR --output-file surface INPUT.ptex`。每次先复制预设再改参数；不改原始材质图、不下载社区材质、不执行导出的 Python 文件。

## 内置预设

| ID | 适用对象 | 注意事项 |
|---|---|---|
| wood | 木纹面板、家具 | 非金属；检查纹理方向、重复尺寸 |
| marble | 大理石饰面、台面 | 非金属；避免花纹过大或重复明显 |
| bricks | 建筑砖墙 | 非金属；按真实砖块尺度铺贴 |
| rock | 岩石 | 非金属；法线不等于真实轮廓细节 |
| rusted_metal | 氧化金属 | 不能默认给所有新设备添加锈蚀 |
| metal_pattern | 花纹金属板 | 检查金属感与纹理尺度 |

这些 `.ptex` 来自官方示例，版本/提交、SHA-256 与标签在 `materials/catalog.json` 中。MIT 许可原文在 `materials/material-maker/LICENSE.md`。首版包含六种，不是整个社区资产库。主色、法线强度、金属度等仍须结合具体模型评审。

## AI 生成的美术方案

在原有 art-plan 的材质规则中新增 `preset`：

```json
{
  "material": "BodyPaint",
  "nodes": ["Body"],
  "replaceTextures": true,
  "metallic": 0,
  "preset": {
    "id": "wood",
    "size": 512,
    "seed": 0,
    "uv": "generate-if-missing",
    "uvScale": [1, 1],
    "normalStrength": 0.4,
    "parameters": [{"node": "perlin_2", "parameter": "scale_x", "value": 16}]
  }
}
```

完整文件见 `art/material-maker-demo.json`。`material`、`nodes` 是输入的精确名称，不是语义猜测；先用 `npm run inspect` 核对。`materials inspect <id>` 列出预设实际可修改的数值参数；只允许修改存在的数值，不接受任意 shader、脚本或文件路径。`seed`、参数和导出尺寸会进入本轮记录。

- `size`：64–2048 的 2 次幂；先用 256/512 低分辨率评估，最终再提高。
- `uv: preserve`：目标必须已有 UV0，缺失立即报错。`generate-if-missing`：仅在对象完全没有 UV 层时生成 Smart UV，不重展已有 UV。
- `uvScale`：缩放目标材质面上的 UV；非目标材质的 UV 不改。真实纹理尺度和木纹方向必须看图检查；Smart UV 不是美术级人工展 UV。
- `normalStrength`：0–2；别把所有细节都堆成凸起。
- `replaceTextures: true`：显式选择替换目标材质的贴图组合，不能悄悄覆盖铭牌、Logo 或功能颜色。预设只接入不透明源材质，透明材质目前拒绝处理。
- 外层 `baseColor/roughness/metallic` 是明确的标量覆盖，会断开相应预设通道；要保留预设颜色/粗糙度图，就不要写同名标量。非金属类目录默认不使用金属度图。

## 导出和验收

使用官方 Blender 导出目标，颜色 PNG 按 sRGB；粗糙度/金属度 EXR 与法线 PNG 按 Non-Color，通过 Principled BSDF 与切线 Normal Map 连接。导出 GLB 时 Blender 将可支持的贴图打包进模型，随后重新导入 GLB，生成相同条件的 before/after 图。

当前接入 baseColor、roughness、metallic、normal；位移、AO、SSS 和 emission 不接入，manifest 会记录。法线只改变光照细节，不会给轮廓增加几何。部分预设未连接某个通道时使用明确的标量回退，不能声称所有材质都有完整四通道。

每轮包含：

- `materials/<规则序号>/preset.ptex`、导出贴图、`manifest.json` 与 `material-maker.log`。
- `requested-art-plan.json`（原始意图）、`art-plan.json`（包含解析后贴图路径的实际执行方案）、`materials-report.json`（来源与通道记录）。
- 原有 GLB、blend、前后图、格式/节点检查和 `review.json`。

输出缺失、尺寸不符或非法文件要失败；Material Maker 退出码为 0 也不足以通过。Codex 必须实际查看渲染结果，检查材质语义、纹理方向、接缝、法线、重复尺度与非目标部件。每轮从原始模型重跑，不在之前结果上叠加 UV 缩放。

## 给 Codex 的任务

> 按 AGENTS.md、art/ART_BIBLE.md 与 docs/material-maker.md 美化 input/model.glb 的材质。检查模型和参考，查询 Material Maker 预设，逐部件选择合适材质，记录理由。创建新的美术方案，调用 Material Maker 生成贴图并由 Blender 应用，实际查看前后图，必要时调整参数或换预设，最多三轮。保留设备名称、层级、变换与 extras。铭牌与功能色不要覆盖。交付最佳 GLB、blend、贴图和审阅记录。

`npm test` 中模拟导出测试明确标注为 simulated；只有设置 `MATERIAL_MAKER_BIN` 才执行真实 Material Maker 导出测试。Blender 集成同样需设置 `BLENDER_BIN` 或在 PATH 中找到程序。不要把 skip 计为运行通过。
