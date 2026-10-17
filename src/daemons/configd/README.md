# configd

已迁入官方 Microduck configd（9136aa4，Apache-2.0），保留 Net / Pads / identity / store / power / units 等模块。Hatchery 通过有凭据检查的 Unix RPC 复用 NetworkManager 与 BlueZ；Web 适配见 `src/connections.rs`。

板端构建：在 `src/` 执行 `cargo build --locked --release -p configd --features board-runtime --bin configd`。启动、权限和功能范围见 [设备连接说明](../../../docs/DEVICE_CONNECTIONS.md)。

`systemd/` 是未改动的官方参考单元，使用 `/opt/robot` 与 robot 用户组，不是本工作区安装入口。本轮不自动安装 / 启用服务，不修改板上网络。完整来源清单见 [UPSTREAM_IMPORT.json](../../../docs/UPSTREAM_IMPORT.json)。
