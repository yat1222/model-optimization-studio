# cc-blender-skill 材质参数参考

主分支将 [RobLe3/cc-blender-skill](https://github.com/RobLe3/cc-blender-skill) 的材质配方整理为可供 Codex 查询的参数参考。固定提交 `a2634b588e80265e796aa53f8ab178d75105c2af`，源文件为 `plugin/skills/blender-materials/SKILL.md` 及其 `references/overview.md`；MIT 许可保存在 `docs/third-party/cc-blender-skill/LICENSE`。

这是**配方起点与建模经验**，不是所有现实材质的实测参数标准。它不负责识别模型由什么材料制成，也不会自动覆盖模型。Codex 应结合用户参考、用途、表面涂层与原有贴图作出选择，再生成逐节点方案并渲染验证。

## 查询与使用

```bash
# 查看全部 14 项，标明可执行基础参数或仅供参考
npm run material:reference -- list
npm run material:reference -- list 塑料
npm run material:reference -- show brushed-steel

# 生成可粘贴到 art-plan.materials 的规则；默认保留原颜色和贴图策略
npm run material:reference -- rule brushed-steel --material BodyPaint --node Body

# 明确要使用源配方的颜色时，做线性→sRGB转换
npm run material:reference -- rule polished-copper --material Copper --node Pipe --color source
```

生成示例：

```json
{"material":"BodyPaint","nodes":["Body"],"metallic":1,"roughness":0.25}
```

将其放入现有 `art/<asset>-v1.json` 的 `materials` 数组，再运行原来的 `npm run beautify -- <模型> --plan <方案>`。`--node` 可重复，省略时影响该精确材质引用的所有对象；先用 `npm run inspect -- <模型>` 核对，不要猜名字。命令只生成规则，不自动修改模型文件。

`--replace-textures` 会在规则里写入 `replaceTextures:true`；没有该选项时，原执行器仍会保留已连接的贴图并在报告中记录跳过。不能为了套用一个数值就删除铭牌、Logo、法线和原有材质变化。

## 配方索引

原始值、引用章节、颜色空间、可选参数和适用限制均在 `art/material-parameters.json` 中。

| ID | 材质/表面 | Metallic 起点 | Roughness 起点 | 当前主分支 |
|---|---|---:|---:|---|
| brushed-steel | 拉丝钢基础层 | 1 | 0.25 | 可生成标量规则；不自动生成拉丝纹理/方向 |
| mirror-chrome | 抛光铬 | 1 | 0.02 | 可生成标量规则 |
| polished-gold | 抛光金 | 1 | 0.05 | 可生成标量规则；源颜色有越界通道 |
| polished-copper | 抛光铜 | 1 | 0.05 | 可生成标量规则 |
| matte-plastic | 哑光塑料 | 0 | 0.6 | 可生成标量规则；IOR 仅作参考 |
| glossy-plastic | 光泽塑料基础层 | 0 | 0.15 | 可生成标量规则；不包含清漆层 |
| soft-silicone | 硅胶基础层 | 0 | 0.7 | 可生成标量规则；IOR 仅作参考 |
| wood-base | 木材基础层 | 0 | 0.7 | 从上游木纹配方提取的局部适配；不生成木纹 |
| clear-glass | 透明玻璃 | 0 | 0 | 仅参考：还需要透射与 IOR |
| frosted-glass | 磨砂玻璃 | 0 | 0.3 | 仅参考：还需要透射与 IOR |
| lacquered-plastic | 清漆塑料 | 0 | 0.15 | 仅参考：还需要 Coat |
| velvet | 天鹅绒 | 0 | 0.9 | 仅参考：还需要 Sheen |
| skin-light | 皮肤 | 0 | 0.4 | 仅参考：还需要 SSS 与尺度设置 |
| colored-glass | 体积着色玻璃 | 0 | 0.025 | 仅参考：还需要透射、IOR、体积吸收 |

针对仅供参考的配方，`rule` 命令明确拒绝生成，不能把缺少透射的灰白不透明材质当成玻璃。IOR、Coat、Sheen、SSS、Volume Absorption 等只记录在 `referenceOnly`；本次没有扩大 Blender 执行器及 glTF 扩展支持范围。

## 采用时的修正和限制

1. **金属度通常接近 0 或 1，但不是硬性二选一。** 对均质裸金属从 1 开始，塑料、木材、硅胶、普通涂漆表面从 0 开始。金属底材上有涂漆，外观由可见涂层决定。材质覆盖混合、金属度贴图过滤和分层近似允许中间值；不能把它们一律判作不物理。glTF 标准本身用金属与介电 BRDF 的混合表示此参数。
2. **粗糙度描述表面处理，不由“钢/木材”名称唯一决定。** 同一材质的抛光、喷砂、拉丝、磨损可以不同。表中数值只是初始猜测；不要把镜面 roughness=0 当成非法值，也不要强制把所有金属提亮。
3. **颜色空间必须区分。** 上游配方直接写 Principled BSDF 的颜色输入，是线性值；本项目 art-plan 的 `baseColor` 是 sRGB，Blender worker 再转到线性。`--color source` 先做反向转换，避免二次变暗；默认 `keep` 不改变原色。JSON 中的 `sourceColorLinear` 不得直接粘贴进 `baseColor`。
4. **越界颜色不自动修补。** 上游金配方含红通道 1.022，而当前项目输入限定 0–1。默认仍可参考金属度/粗糙度；请求源颜色时会报错，不静默截断，也不宣称这些配方是经过校准的反射率测量。需要准确 F0 时另查有明确颜色空间/单位的权威数据。
5. **不直接搬用上游 5.x 代码。** 上游主要在 Blender 5.1.1 验证，本项目仍固定 Blender 4.5 LTS，用现有执行器写 Principled 节点，并进行 GLB 重导入检查。不上调 Blender、不安装 MCP、不安装整套 30 个技能、不重命名原业务节点。
6. **复杂着色须验证交付格式。** 程序节点、Mix Shader、体积吸收等不能假设会被当前 GLB 管线完整保留。需要烘焙或支持对应扩展时单独实现并测试；不能仅凭 `.blend` 看起来正确就说 Three.js 也相同。

官方核对依据：[glTF 2.0 材质](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#materials)、[glTF 金属粗糙度 BRDF](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#appendix-b-brdf-implementation)、[Blender Principled BSDF](https://docs.blender.org/manual/en/4.5/render/shader_nodes/shader/principled.html)。官方规范与当前实际执行器优先于上游配方中的泛化建议。

## Codex 执行约定

用户要求“金属像金属、塑料像塑料”时，先读取本文件与参数 JSON，再查看模型和用户参考。选择可执行基础参数，保留部件颜色/贴图，明确解释外观依据。把所选 profile ID、固定来源提交和改动理由记在本次方案的 `.md` 中；执行参数放在兼容现有 schema 的 `.json` 中，不把查询 metadata 塞进执行器。

随后真实运行 Blender，查看相同条件的前后图，必要时调整粗糙度、颜色和光照判断，最多三轮。审阅仍按 `art/ART_BIBLE.md`，数值落在范围内不等于审美通过。Material Maker 贴图生成继续位于其独立分支，本次只增加主分支参数参考。
