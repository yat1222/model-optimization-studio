# 验证记录

## v0.2.1 参数参考集成（main）

2026-11-02，Linux，Node.js v24.22.1，Blender 4.5.3 LTS。

`BLENDER_BIN=/path/to/blender npm test`：19/19 通过，无跳过。

- 固定来源的 14 个 profile、基础参数与高级配方的边界检查。
- 生成的规则符合现有 art-plan schema，默认保留原颜色与贴图策略。
- 上游线性颜色到项目 sRGB 再回到线性的回归验证；拒绝金配方越界通道的静默截断。
- 缺少透射、Coat、Sheen 或 SSS 的配方不能生成误导性的可执行规则。
- 真实 Blender 4.5.3 LTS：将生成的拉丝钢基础规则应用到示例，导出 GLB，再读回核对 metallic=1、roughness=0.25、线性颜色与源值一致；Validator 与业务节点契约通过。
- 原有 14 项轻量化/美化测试继续通过。本次不修改 Blender worker，不包含 Material Maker 分支代码。

CLI list/show/rule 已执行。以上是参数/格式/结构验证，不是对真实用户资产的美术终审；visualReview 仍保持 pending。

## v0.2 Blender 美化

2026-11-02，Linux，Node.js v24.22.1，官方 Blender 4.5.3 LTS 二进制。

`BLENDER_BIN=/path/to/blender npm test`：14/14 通过，无跳过（包含原轻量化的 8 项）。

- 美术 JSON 参数范围、未知字段、静态模型前置条件、精确材质/节点匹配验证。
- 节点名称/层级/变换/extras 契约：容许浮点误差，拒绝缺失锚点或修改 extras。
- 缺失 Blender、子进程失败、超时、失败报告和不发布未验收 GLB。
- 真实 Blender 端到端：材质参数实际写入，倒角导致导出三角形增加；GLB Validator 零错误，业务节点契约通过。
- GLB 重导入后生成 hero 与底视图的前后 PNG，before/after 内容不同；输出 blend 与对比 HTML，GLB 不夹带展示相机。

演示 CLI 另外生成了 768px、32 samples 的多方向前后图、GLB 和打包 blend；实际查看过 hero 图，验证颜色/材质分工与边缘高光的变化。示例是简单静态几何，不代表复杂用户资产的质量保证；该示例没有进行完整美术终审，visualReview 仍为 pending。

没有测试真实用户模型、Windows/macOS 实机或 Three.js 环境匹配；不宣称任意资产自动美化成功。未装 Blender 时该集成测试会明确 skip，而不是伪造成功。

## v0.1 轻量化记录

2026-11-02，Node.js v24.22.1，Linux。

`npm test`：8/8 通过。

- safe 压缩后 POSITION 数组保持一致，节点契约、extras、动画目标保留。
- 外部 glTF 资源读取，auto 三档候选均通过。
- morph 模型跳过减面。
- 已有 Meshopt 的输入使用 none 时移除几何压缩。
- 未知扩展和远程资源拒绝处理。
- 非法参数拒绝执行。
- PNG 最大边缩小到 1024 并保留 alpha。
- 非法原始几何在执行优化前被 Validator 拒绝。

CLI 端到端：`npm run demo` 后 `npm run optimize -- input/demo.glb --preset auto` 成功。
演示输入 40,536 bytes，输出 10,368 bytes，减少 74.42%；三角形 3,200→1,120；节点 3→3；动画 1→1。

未执行真实用户模型测试、Windows/macOS 实机测试、蒙皮动画专项验收、Three.js 运行时帧率测试或视觉截图验收。演示结果不可推断为所有模型的压缩率。

