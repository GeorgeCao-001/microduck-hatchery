# Microduck Hatchery 仿真与训练

`training/` 是整机复现必需主线，负责模型、仿真、RL、评估和标准策略导出。当前只有说明文件，没有导入训练源码、安装训练依赖、生成模型或运行训练。

依据 [架构 v2](../docs/microduck-hatchery-architecture-v2.md)，后续引入选定训练来源时保持其内部目录、导出入口和运行逻辑，不提前另建 models/configs/evaluation/export 分类或空脚本。固定来源 SHA、锁文件和环境后，再核对 FT 模型、实物参数与设备运行时。

训练使用独立环境；具体 Python/CUDA/Linux 或 WSL2 要求以选定冻结版本与本机硬件为准。当前 Windows 样例服务能运行不表示训练环境可用。

标准产物必须匹配 14 维动作、15 个物理关节、HOME、动作缩放、观察顺序、归一化、IMU 坐标、频率与延迟。mouth #34 始终保留在设备关节表。浏览器不加载、转换或推理策略；训练产物由匹配的 FT 运行时使用。

checkpoint、模型、视频与实验样本遵循 [日志规则](../logs/README.md)，作者结果与团队结果分别记录。实施条件见 [PLAN.md](../docs/PLAN.md)，来源见 [SOURCES.md](../docs/SOURCES.md)。
