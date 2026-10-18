# 远程 Demo 与 Spaces

按 [v2 架构](../docs/microduck-hatchery-architecture-v2.md) 保留官方远程 Demo / Hugging Face Spaces 结构。它们不参与 `robotd → duck-control → motor` 实时控制链，当前优先级低于本地机器人与 Hatchery Web。

| 目录 | 预期用途 |
|---|---|
| [hello](hello/README.md) | 最小远程应用示例 |
| [policy-playground](policy-playground/README.md) | 策略交互与展示 |
| [shared](shared/README.md) | 示例间共享代码 |
| [vision-demo](vision-demo/README.md) | 视觉流与远程处理示例 |
| [vetbook](vetbook/README.md) | 官方诊断记录示例；旧 FT 后端未实现对应调用 |

源码来自固定官方提交 `53230463927095ea890f231d29089bb0a538c06f`，尚未发布远程应用或完成实机交互验证。vision-demo 的三个共享文件在 Windows 工作区展开为原共享源文件，来源清单保留符号链接信息。策略展示示例不改变顶层 Web 不承担策略导入、转换或推理的边界。
