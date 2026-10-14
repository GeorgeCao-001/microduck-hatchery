# duck-ipc-proto

共享 JSON-RPC / IPC 类型库，已迁入官方 robot.* / policy / frame 类型与 Unix 时钟辅助；不依赖 HTTP、串口、UI 或策略实现，保留官方运行时关节顺序。来源见 [导入清单](../../docs/UPSTREAM_IMPORT.json)。

`maintenance` 子模块独立保留 Hatchery `hatchery-maintenance/1`：NDJSON 帧最大 512KiB，state / ports / command 三类方法；命令支持单 ID 操作与 0–253 范围扫描 / 取消，含身份、会话、期限、台架确认和 operation。状态保留 15 关节、raw / 缺测、主机接收时间、source / fake / sim 与所有者；显式台架才开放控制，硬件 profile 与校准不伪称确认。三种索引独立，嘴部 policy_index 为 null。

这是维护子集契约，不是官方 RPC 的复制或整机生产协议冻结；旧 `hatchery-shell/0` JSON 样例保持独立。传输、会话与剩余验收见 [维护后端](../../docs/MAINTENANCE_BACKEND.md)。

构建属于 `src/Cargo.toml` workspace，package.workspace 指向 `../../src`。尚未分配关节的设备（如单颗台架 ID 1）进入独立 `unassigned_devices`，只有原始读取和主机接收时间，不含 runtime / policy 索引；15 关节的数组与三种顺序保持固定。
