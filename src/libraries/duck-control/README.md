# duck-control

官方总线、IMU、observation、policy、sim 与 safety 源码已迁入；`runtime` feature 启用整机模块。保留 `src/` 平铺结构和 RobotIo 接口，不拆成新 drivers framework。

FT / Feetech 适配先核对与复用已有 FT 代码，在 `bus.rs` / `io.rs` 边界做最小修改；串口、寄存器与 raw load 不扩散到 policy、observation 或 Web。设备路径与硬件能力按实际 Radxa Zero 3W 配置确定。

`bus_select.rs` / `bus_feetech.rs` 复用 FT 分支的总线选择和 RobotIo 适配；`bus_feetech_wire.rs` 复用 kissqy 的 Apache-2.0 原生通信部分。FT 整机本轮只读：不改 ID / EEPROM / 增益、不使能、不写策略目标，无真实 IMU 时不宣称就绪，未标定位置不发布为关节角，未知速度和电流比例不换算。

原有台架代码保留在 `bus_maintenance.rs` / `io_maintenance.rs`，默认构建经 bus / io 重导出：有界 PING / READ、参考原码和有限 SRAM 写白名单。资格、限幅和期限由 robotd 决定，不能与整机总线并行。HD 固件、单位、装机零位 / 方向 / 限位和实际 IMU 待确认。

来源、校验和修改范围见 [导入清单](../../../docs/UPSTREAM_IMPORT.json)、[Radxa 指南](../../../docs/RADXA_RUNTIME.md)、[FT 审核](../../../docs/FT_READ_ONLY_SOURCE.md)、[LICENSE-UPSTREAM](LICENSE-UPSTREAM) 与 [NOTICE-FT.md](NOTICE-FT.md)。
