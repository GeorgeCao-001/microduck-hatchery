# Microduck Hatchery Web 来源冻结

设计包来源记录时间为 2026-10-04，属于源码与素材参考，不是设备实测、当前工具账户状态或生产依赖锁定。详细接口事实以 [PROTOCOL_SOURCE_AUDIT.md](PROTOCOL_SOURCE_AUDIT.md) 为主，全栈来源以 [docs/SOURCES.md](../../docs/SOURCES.md) 为主。

## 冻结源码

| 来源 | 完整 SHA | 设计包读取范围 |
|---|---|---|
| [microduck-replica](https://github.com/fanhao375/microduck-replica/tree/b5381d86b68d2e4f4606170d54d1f3f46d249ffc) | `b5381d86b68d2e4f4606170d54d1f3f46d249ffc` | servo-web/server.py、feetech.py、requirements.txt、许可与参考照片 |
| [官方 microduck](https://github.com/pollen-robotics/microduck/tree/9136aa4ee88e81edf2bcaf3527e90b65da25f1eb) | `9136aa4ee88e81edf2bcaf3527e90b65da25f1eb` | 仓库约束与官方运行逻辑参考 |

被审核的上游 servo-web 版本为 `0.15.4`，使用 Starlette、uvicorn、pyserial；numpy 注明供 build_model.py 使用，不是 Web 运行依赖。上游声明的最低依赖版本不等于 Hatchery 的精确锁文件。

上游读取接口为 `/api/info`、`/api/poses`、`/api/logfile` 与 `/ws`，默认监听 `0.0.0.0:8080`。这些是冻结上游事实；当前本地样例工具仅监听 loopback，使用独立 `/api/v1/*` 消息格式，不能混为一套协议。

## 接口使用边界

- 原始位置为 ticks，load 为 raw load；未经实际校准不转换成真实角度或力矩。Unix 时间与单调时间分开。
- 上游默认物理 ID 顺序是左腿 → 头颈嘴 → 右腿；页面显示左腿 → 右腿 → 头颈嘴，14 维策略映射另行维护。
- 缺 key 或 null 都是缺测，15 个物理关节和嘴部仍须保留；fake、演示 IMU 与未知来源不能显示成实机。
- goals_verify 会重写目标，不属于只读；release 恢复相关寄存器设置，不是停止或急停。
- 上游缺完整租约、命令确认与失联生命周期，进程内锁不能仲裁外部 robotd；校准工具与 robotd 不能同时占用总线。
- 正式链路按 [架构 v2](../../docs/microduck-hatchery-architecture-v2.md) 与 [当前架构](../../docs/ARCHITECTURE.md) 推进，冻结上游服务不被指定为第二个权威控制器。

三份审核源码的 blob、字段解析、控制行为与逐条依据全部保留在 [源码审核](PROTOCOL_SOURCE_AUDIT.md)。没有宣称实机 50 Hz、三系统 USB、BLE 吞吐或断线控制已经通过。

## 照片与许可线索

来源：microduck-replica contributors。具体原路径及压缩裁切说明见 [视觉规范](Microduck-Hatchery-Visual-Design.md)。

| 照片 | 来源 Git blob SHA |
|---|---|
| 飞特版装机正面 | `d93d012722f11af01dd0a1a11ad479ae1305f01c` |
| 飞特版装机手持 | `5cd0c9cda1b06b760d2b6bd3341ae806b5210f3f` |

来源代码/工具为 Apache-2.0，照片/文档/装配资料为 CC BY-NC-SA 4.0，具体适用范围以来源 LICENSE / NOTICE 为准。贡献者署名随素材保留；字体与图标许可在 [licenses/](../licenses/)。官方品牌仅作参考，Hatchery 为独立项目。
