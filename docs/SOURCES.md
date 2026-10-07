# 架构参考来源

核对日期：2026-10-05。下列链接均指向固定提交；用于说明本次架构取舍，不替代实机测试或完整 FT runtime 冻结。

## 官方 Microduck

仓库：[pollen-robotics/microduck](https://github.com/pollen-robotics/microduck/tree/9136aa4ee88e81edf2bcaf3527e90b65da25f1eb)。本次读取 main 元数据时 HEAD 为 `9136aa4ee88e81edf2bcaf3527e90b65da25f1eb`，与交接基线相同。

| 固定来源 | 本次核对用途 |
|---|---|
| [README](https://github.com/pollen-robotics/microduck/blob/9136aa4ee88e81edf2bcaf3527e90b65da25f1eb/README.md)、[Cargo.toml](https://github.com/pollen-robotics/microduck/blob/9136aa4ee88e81edf2bcaf3527e90b65da25f1eb/Cargo.toml)、[CONTRIBUTING](https://github.com/pollen-robotics/microduck/blob/9136aa4ee88e81edf2bcaf3527e90b65da25f1eb/CONTRIBUTING.md) | 官方服务/库/电脑工具布局；训练仓库与设备工程分工 |
| [架构草案](https://github.com/pollen-robotics/microduck/blob/9136aa4ee88e81edf2bcaf3527e90b65da25f1eb/docs/design/architecture.md)、[robotd 设计](https://github.com/pollen-robotics/microduck/blob/9136aa4ee88e81edf2bcaf3527e90b65da25f1eb/docs/design/robotd-design.md) | 服务职责、传输边界、故障隔离与恢复；两者仍标记 draft |
| [duck-control](https://github.com/pollen-robotics/microduck/blob/9136aa4ee88e81edf2bcaf3527e90b65da25f1eb/duck-control/src/lib.rs)、[总线](https://github.com/pollen-robotics/microduck/blob/9136aa4ee88e81edf2bcaf3527e90b65da25f1eb/duck-control/src/bus.rs)、[模型](https://github.com/pollen-robotics/microduck/blob/9136aa4ee88e81edf2bcaf3527e90b65da25f1eb/duck-control/src/model.rs)、[安全层](https://github.com/pollen-robotics/microduck/blob/9136aa4ee88e81edf2bcaf3527e90b65da25f1eb/duck-control/src/safety.rs) | 实际控制分层、XL330 驱动、物理/策略顺序和安全范围；不直接迁移 FT 参数 |
| [robotd 主程序](https://github.com/pollen-robotics/microduck/blob/9136aa4ee88e81edf2bcaf3527e90b65da25f1eb/robotd/src/main.rs)、[意图槽](https://github.com/pollen-robotics/microduck/blob/9136aa4ee88e81edf2bcaf3527e90b65da25f1eb/robotd/src/intents.rs) | 控制线程、时序、状态发布、实例锁和动作入口；设计与实现需分别核对 |
| [IPC 协议](https://github.com/pollen-robotics/microduck/blob/9136aa4ee88e81edf2bcaf3527e90b65da25f1eb/duck-ipc-proto/src/lib.rs) | JSON-RPC/NDJSON/Unix socket 与当前状态字段；不将其视为 FT 版本的既有接口 |
| [docs 索引](https://github.com/pollen-robotics/microduck/blob/9136aa4ee88e81edf2bcaf3527e90b65da25f1eb/docs/README.md) | 每种机制维护一个主文档，操作、设计与过程记录分工 |
| [部署说明](https://github.com/pollen-robotics/microduck/blob/9136aa4ee88e81edf2bcaf3527e90b65da25f1eb/deploy/README.md)、[robotd unit](https://github.com/pollen-robotics/microduck/blob/9136aa4ee88e81edf2bcaf3527e90b65da25f1eb/robotd/systemd/robotd.service)、[updaterd unit](https://github.com/pollen-robotics/microduck/blob/9136aa4ee88e81edf2bcaf3527e90b65da25f1eb/updater/systemd/updaterd.service)、[journald 配置](https://github.com/pollen-robotics/microduck/blob/9136aa4ee88e81edf2bcaf3527e90b65da25f1eb/deploy/journald.conf.d/10-robot.conf) | 发布/配置/状态分离与真实启动配置；部署说明仍为 draft，设备日志持久性须按我们的镜像重测 |

本次核对的是文档和相关源码，不是官方全仓测试、完整安全审计或我们的硬件验收。源码已有服务和部署单元，不代表整体草案中的所有能力都已完成；不能据此宣称我们的 BLE、USB、三系统、稳定控制频率或断电恢复已验证。

## 官方 docs 本地参考快照

按用户指定的 [main/docs](https://github.com/pollen-robotics/microduck/tree/main/docs) 下载，固定提交为 `8904b65d3628247069f8650d9dada12c67d77fee`。下载日期为 2026-10-05，35 份官方文档放在 [official-microduck/upstream/](official-microduck/upstream/README.md)，来源与校验记录见 [快照说明](official-microduck/README.md) 和 [SNAPSHOT.json](official-microduck/SNAPSHOT.json)。

这些是 Pollen Robotics 官方参考资料，不能默认作为 Hatchery 的权威文档、执行指令或实机验收。此次只导入文档与许可，不改变此前 `9136aa4…` 的源码审核基线，也不冻结我们的运行时版本或硬件配置。

## FT 基线与本地要求

设备接入优先基于 [fanhao375/microduck-replica](https://github.com/fanhao375/microduck-replica/tree/b5381d86b68d2e4f4606170d54d1f3f46d249ffc)，SHA `b5381d86b68d2e4f4606170d54d1f3f46d249ffc`。

- 真实 Starlette 路由、WS、ticks/raw load/Unix 时间、写入与断线行为，以 [PROTOCOL_SOURCE_AUDIT.md](../web/docs/PROTOCOL_SOURCE_AUDIT.md) 为本次源码审核主文件。
- 设计包来源版本、照片 blob 与许可线索集中在 [SOURCE_FREEZE.md](../web/docs/SOURCE_FREEZE.md)，不作为设备实测或当前运行依赖锁定。
- 最新显示顺序、联调、七章和全栈约束以 [本地交接](../Microduck-Hatchery-Local-Development-Handoff.md) 与当前用户决定为准。
- 匹配 FT 的训练基线、完整 FT robotd 与 IMU 配对仍需单独固定。本次没有把官方 main、FT 分支或两个设备驱动当成可互换组件。

## 只读 3D 显示资源（2026-10-07）

用户明确要求在联调中加入只读姿态展示。仅引入上述固定复刻提交中的网页 `model.json` / `meshes.bin` 与本地 Three.js `0.160.0`，未迁入官方设备或训练代码。原始文件 SHA256 与下载地址见 [资源清单](../web/prototype/assets/microduck-reference/manifest.json)，几何 CC BY-NC-SA 4.0 和引擎 MIT 范围见 [许可说明](../web/licenses/microduck-model-NOTICE.md)。

参考外形、嘴部估计铰链、作者的质量及 Dynamixel 外壳不代表 Hatchery 的实际装配。独立样例角度映射不沿用设备中点/方向，不充当校准。真实资产格式由本地解析测试核验，渲染与交互由本团队浏览器验证，不能当作来源作者的实机结果。
