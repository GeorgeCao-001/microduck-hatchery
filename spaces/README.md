# 远程 Demo 与 Spaces

按 [v2 架构](../docs/microduck-hatchery-architecture-v2.md) 预留远程 Demo / Hugging Face Spaces 目录。它们不参与 `robotd → duck-control → motor` 实时控制链，当前优先级低于本地机器人与 Hatchery Web。

| 目录 | 预期用途 |
|---|---|
| [hello](hello/README.md) | 最小远程应用示例 |
| [policy-playground](policy-playground/README.md) | 策略交互与展示 |
| [shared](shared/README.md) | 示例间共享代码 |
| [vision-demo](vision-demo/README.md) | 视觉流与远程处理示例 |

当前仅目录说明，未导入源码，无 Cargo manifests、binary 或已部署远程应用。策略展示示例不改变顶层 Web 不承担策略导入、转换或推理的边界。
