# 训练与离线视觉工具

按原仓库结构保存两个独立来源，具体逐文件哈希、模式和提交见 [TRAINING_IMPORT.json](../docs/TRAINING_IMPORT.json)。本目录不参与板端 Cargo 默认构建，不在 Radxa 上自动安装训练依赖。

| 目录 | 来源提交 | 当前状态 |
|---|---|---|
| [microduck_rl](microduck_rl/README.md) | `b02fdea4902c2b93b7d34a83a6f05da4ececb7d3` | 原样源码与锁文件，未运行训练、导出或部署 |
| [duck_detector](duck_detector/README.md) | `cc1b52eb3ace9643c8948320e63f46a85cf6fb65` | 原样采集、标注、训练、导出、浏览器 watch 工具；未下载模型或数据集 |

microduck_rl 仍为官方 XL330 / BAM 执行器模型，不能当作飞特 HD1910 已适配。FT 物理模型、三种关节索引和实测参数需要独立验证；本轮不更改现有舵机逻辑、不启用这些策略。

代码保留原 Apache-2.0 许可；RL 的 STL 文件另受 [LICENSE-MODELS.md](microduck_rl/LICENSE-MODELS.md) 所列 CC BY-NC-SA-4.0 许可约束，未修改网格。原仓库 AGENTS / CLAUDE 文件只作用于其子目录，不替代 Hatchery 根目录约束及用户最新决定。

普通 Web 保留设备观察与已接入能力；官方训练 watch 是独立离线工具，未伪装成已上线的 Hatchery 功能。没有执行 Hub 上传、远程任务或发布。
