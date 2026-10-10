# robotd

主控制进程位置，Radxa Zero 3W 是整机主要运行平台。未来统一管理运行模式、控制意图、权威状态和电机总线，通过 `duck-control` 执行控制与安全检查；Web gateway 不得另写总线或合成执行成功。

当前已有最小 Rust 只读维护入口：loopback RPC、串口枚举、显式 fixture / 未连接状态，以及经显式配置的 PING / 固定参考 READ。仅该进程拥有总线；无写入、策略、IMU 或控制租约，不能视作完整官方 robotd。真实串口、HD 寄存器与整机控制频率未验收，未部署。运行见 [维护后端](../../../docs/MAINTENANCE_BACKEND.md)。

台架可显式读取当前未分配关节的 ID（如 ID 1），结果独立于 15 关节索引，不自动修改舵机 ID 或绑定关系。2026-10-10 已在 Windows COM5 / 1 Mbps 取得 ID 1 的真实 PING 状态 0；HD 寄存器、原码单位、物理角度和控制仍未验收。
