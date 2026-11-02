# 验证记录

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
