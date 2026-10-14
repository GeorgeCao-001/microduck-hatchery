# Microduck Hatchery 设备模块

以 [v2 架构](../docs/microduck-hatchery-architecture-v2.md) 为主要依据，只做 daemon 与 library 的浅层分类，未来导入时以完整 crate 为单位保留内部结构，不另设 `api/controller/adapters/runtime` 生产架构。

```text
src/
├─ Cargo.toml    12 成员 workspace；IPC / 测试辅助位于顶层对应模块
├─ Cargo.lock    解析依赖锁定
├─ rust-toolchain.toml
├─ daemons/      robotd、updater、configd、btd、padd、mediad、tof
└─ libraries/    duck-control、robotd-params、kinematics、odometry、
                sounds、pet-detect、duck-detect、pad-imu、uyvy
```

[daemon 说明](daemons/README.md)与 [library 说明](libraries/README.md)列出各模块职责。已按完整 crate 迁入官方 robotd / mediad、duck-control、robotd-params、kinematics、odometry、sounds、uyvy、pet-detect、duck-detect、共享 IPC 与 test-support。Radxa Zero 3W 是主要运行平台，FT 本轮只读，设备路径显式配置；其他 daemon 和 pad-imu 尚未迁入。构建 / 配置见 [Radxa 指南](../docs/RADXA_RUNTIME.md)，来源及修改见 [导入清单](../docs/UPSTREAM_IMPORT.json)。上板和动作尚未验收。

轻量电脑入口使用 `python scripts/hatchery-maintenance.py --build-only`，只构建 `robotd-maintenance` / `mediad-maintenance`；不要求 GStreamer、IMU 或策略库。Linux 板端用 `sh scripts/build-radxa.sh` 显式启用 `board-runtime`，同时构建四个入口。默认输出 `src/target/`；环境变量 `CARGO_TARGET_DIR` 可覆盖，相对路径按 `src/` 解析。Python [样例工具](../tools/hatchery-shell/README.md)继续独立，不占串口。

## 权威控制链

正式目标关系为：

```text
Browser / Hatchery Web
    → board-side Web / media gateway
    → shared protocol / RPC
    → robotd
    → duck-control / safety
    → motor bus
```

顶层 `web/` 是 Hatchery 的调试、展示和教程前端。gateway 负责传输意图与实际回复；robotd 与 duck-control 是设备控制权威，负责真实状态、模式、限位、校准有效性、命令期限、执行确认与失联处置。前端草稿、滑块、缓存和定时器不能成为控制依据，gateway 不得合成“已应用”或“已到位”。这些语义仍待真实后端实现与验证。

## 实际硬件与所有权

- 按 Radxa Zero 3W 与 FT / Feetech 实际硬件适配，先核对和复用已有 FT 代码；在 `duck-control` 的 `bus.rs` / `io.rs` 边界做最小修改，不另造 drivers framework，不向 policy、observation 或 Web 扩散 FT 寄存器细节。
- 不默认有 Dynamixel、完整官方 Robot HAT、IMU、ToF、Camera；UART、I2C、GPIO 与摄像头设备路径、权限及能力均由实际配置确定。
- 电机总线只允许当前控制器持有；单独校准工具与 robotd 必须互斥，读取轮询也不能绕过所有权。进程内串口锁不能代替跨进程仲裁。
- 区分全部 15 个物理关节、展示顺序、运行时顺序及 14 维策略顺序，保留嘴部；ticks / 角度、raw load、Unix / 单调时间与 fake / sim 来源不得混用。
- 后端能力未验证时保持控制禁用；重连不自动使能或补发旧目标，`release` 不等于停止或急停，记录回放不发送历史目标。

现有 FT 来源核对见 [协议审核](../web/docs/PROTOCOL_SOURCE_AUDIT.md)；结构状态和后续步骤见 [ARCHITECTURE.md](../docs/ARCHITECTURE.md) 与 [PLAN.md](../docs/PLAN.md)。
