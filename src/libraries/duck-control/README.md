# duck-control

总线、IMU、observation、policy 与 safety 库的预留位置。未来保持来源 `src/` 的平铺结构，包括 `bus.rs`、`io.rs`、`obs.rs`、`policy.rs`、`safety.rs` 等，不拆成新 drivers framework。

FT / Feetech 适配先核对与复用已有 FT 代码，在 `bus.rs` / `io.rs` 边界做最小修改；串口、寄存器与 raw load 不扩散到 policy、observation 或 Web。设备路径与硬件能力按实际 Radxa Zero 3W 配置确定。

当前已有 Cargo library 与 `src/bus.rs` / `src/io.rs`：仅适配冻结 FT 的包、回复校验、固定 READ 与参考原码解码。没有 WRITE、策略、IMU 或完整 safety 实现，库不独立运行。HD 实际固件、寄存器、物理单位和装机标定未确认。

复用范围、源文件校验和依赖见 [FT 审核](../../../docs/FT_READ_ONLY_SOURCE.md)；来源 Apache-2.0 见 [LICENSE-FT](LICENSE-FT) 与 [NOTICE-FT.md](NOTICE-FT.md)。完整官方 crate 未迁入，不能把当前只读子集作为整机控制库使用。
