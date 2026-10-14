# robotd

主控制进程，Radxa Zero 3W 是主要运行平台。官方主循环、模式、意图、Unix RPC 和 safety 调用结构已迁入，通过 duck-control 持有总线；Web gateway 不得另写总线或合成执行成功。

`robotd` binary 需 `board-runtime`。FT 整机默认只读，仅接受状态类 RPC，不启动策略 / 输出，不自动改 ID 或寄存器；未标定角度和真实 IMU 不伪造。配置与启动见 [Radxa 指南](../../../docs/RADXA_RUNTIME.md)，上板和装机运控尚未验收。

`robotd-maintenance` / `maintenance_main.rs` 保留轻量电脑入口：loopback RPC、枚举、fixture / 未连接、PING / READ 与显式限幅台架 SRAM 操作。maintenance.rs 管理单 ID 命令、期限 / 去重 / 资格，扫描 / 取消覆盖 0–253，初始 ID 名单可省略；自身 ID 修改须通过 FD 固件、输出和冲突检查。collector 是唯一总线执行者，未归类 ID 也可调试。与整机服务互斥；见 [维护后端](../../../docs/MAINTENANCE_BACKEND.md)。

台架可显式读取当前未分配关节的 ID（如 ID 1），结果独立于 15 关节索引，不自动修改舵机 ID 或绑定关系。2026-10-10 已在 Windows COM5 / 1 Mbps 取得 ID 1 的真实 PING 状态 0；HD 寄存器、原码单位、物理角度和控制仍未验收。
