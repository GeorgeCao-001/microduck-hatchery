# 板端进程

按 [v2 架构](../../docs/microduck-hatchery-architecture-v2.md) 分类，保留 crate 边界。robotd / mediad 当前已有最小只读维护 binary，完整官方 daemon 尚未迁入；其他位置只有目录说明。主运行平台是 Radxa Zero 3W，电脑维护入口是辅助能力；均未部署或实机验收。

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
