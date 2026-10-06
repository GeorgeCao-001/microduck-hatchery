# 板端进程

按 [v2 架构](../../docs/microduck-hatchery-architecture-v2.md) 分类，daemon 作为完整 crate 保留内部结构。当前只有目录说明，未导入源码；没有 Cargo manifests、可运行 binary 或已部署服务。

| 模块 | 预期职责 |
|---|---|
| [robotd](robotd/README.md) | 主控制进程与权威状态，统一总线所有权 |
| [updater](updater/README.md) | 更新与恢复 |
| [configd](configd/README.md) | WiFi 与系统配置 |
| [btd](btd/README.md) | BLE 通信入口 |
| [padd](padd/README.md) | 手柄输入转换为控制意图 |
| [mediad](mediad/README.md) | 媒体与板端 Web gateway |
| [tof](tof/README.md) | ToF 数据服务 |

未来导入时保留 crate、binary、service 原名称，依据实际 Radxa Zero 3W 配置逐项启用。预留目录不表示板上已具备摄像头、官方 HAT 或对应设备节点。
