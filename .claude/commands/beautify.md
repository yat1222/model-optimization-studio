以模型美化为主处理 $ARGUMENTS。

1. 读取 AGENTS.md、art/ART_BIBLE.md、README.md。
2. 查验原始模型/资源与 Blender 4.5 LTS。用 `npm run inspect -- "<模型路径>"` 读取节点、材质、贴图和变换；检查尺寸。用户没给参考时采用工业产品方向并记录假设。
3. 建立 art/<asset>-v1.json 与同名美术说明；必要时先用 industrial.json 输出基线截图，再实际查看 before 图片制定逐部件修改。只有平面贴图/缺失几何时不要承诺能恢复不存在的细节。
4. 承担 art-director 的方向决策与 blender-artist 的实现工作，按顺序执行；按宿主能力可使用对应角色，但无需为简单任务启动多代理。
5. 实际运行 npm run beautify -- "<原始模型>" --plan "art/<asset>-v1.json"。检查 report.json 与 blender.log，失败先修复，不交失败候选为成品。
6. 实际打开每一对 before/after 图片，按 art/ART_BIBLE.md 填写本次 review.json，列出问题和下一轮精确改动。没有图像读取能力则记录 not-assessed。
7. 如果明显问题可解决，从原始模型使用 v2/v3 方案重新运行。最多三轮，记录 iteration-notes.md 中每轮目录和选择理由；不无限修补、不按体积选美术结果。
8. 交付最佳候选 GLB、blend、comparison.html、方案、报告和真实审阅状态。保留原输入和全部历史目录。只有用户另外要求压缩时，才在美化候选上运行 safe optimize 并重新检查效果。
