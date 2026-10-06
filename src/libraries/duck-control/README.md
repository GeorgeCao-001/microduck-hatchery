# duck-control

总线、IMU、observation、policy 与 safety 库的预留位置。未来保持来源 `src/` 的平铺结构，包括 `bus.rs`、`io.rs`、`obs.rs`、`policy.rs`、`safety.rs` 等，不拆成新 drivers framework。

FT / Feetech 适配先核对与复用已有 FT 代码，在 `bus.rs` / `io.rs` 边界做最小修改；串口、寄存器与 raw load 不扩散到 policy、observation 或 Web。设备路径与硬件能力按实际 Radxa Zero 3W 配置确定。

当前仅此说明文件，未导入源码，无 `Cargo.toml`、`src/` 或 binary，未部署；库不独立运行。
