# duck-ipc-proto

共享 JSON-RPC / IPC 类型库的位置，供 gateway、工具和 robotd 共享；不依赖 HTTP、串口、UI 或策略实现。

当前 Cargo library 定义 Hatchery 最小 `hatchery-maintenance/1` 契约：NDJSON 帧最大 64KiB，方法仅 `maintenance.state` / `maintenance.ports`；状态保留 15 关节、raw / 缺测、主机接收时间、source / fake / sim 与总线所有者，校准和控制始终未确认。显示、runtime、policy 索引独立，嘴部 policy_index 为 null。

这是只读维护契约，不是官方 RPC 的复制或整机生产协议冻结；旧 `hatchery-shell/0` JSON 样例保持独立。传输、会话与剩余验收见 [维护后端](../../docs/MAINTENANCE_BACKEND.md)。

构建属于 `src/Cargo.toml` workspace，package.workspace 指向 `../../src`。尚未分配关节的设备（如单颗台架 ID 1）进入独立 `unassigned_devices`，只有原始读取和主机接收时间，不含 runtime / policy 索引；15 关节的数组与三种顺序保持固定。
