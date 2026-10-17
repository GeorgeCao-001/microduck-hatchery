# Runtime source notices

Pollen Robotics Microduck source is pinned to `9136aa4ee88e81edf2bcaf3527e90b65da25f1eb` (0.15.1). Imported crates retain `LICENSE-UPSTREAM` (Apache-2.0). Source-to-local paths, hashes and modified-file flags are in [UPSTREAM_IMPORT.json](../docs/UPSTREAM_IMPORT.json).

The FT selector and RobotIo adapter derive from fanhao375/microduck, commit `8db8f00c8fc5278d0bdf43f96934531c37ee2780`, Apache-2.0. Native FT packet decoding and bounded reads derive from the Rust firmware portion of kissqy/Microduck-kissqy, commit `94328f5b43c8ac825c90f0e564e7d1b926cd770d`, Apache-2.0. Its separately licensed console, training tools, FT6 firmware and runtime policy weights were not imported. Existing maintenance transport retains its separate LICENSE-FT / NOTICE-FT attribution.

Hatchery changes: v2 crate paths, explicit runtime features and maintenance binaries, HD1910 read-only bus adaptation, calibration validity gates, read-only RPC admission, explicit camera nodes / sensor configuration, measured-intrinsics requirements, local-only media startup, Hatchery camera page, bounded live camera controls with shared exposure arbitration, and Radxa service configuration. These modifications and local builds do not attest to upstream or Hatchery hardware test results.

Original tests and tiny model fixtures belong to their source crates. OTA-dependent integration tests are outside this workspace slice; original assertions were not weakened. Radxa runtime config and parameter-schema fixtures serve different purposes. Upstream comments can refer to tools not imported in this phase; use [RADXA_RUNTIME.md](../docs/RADXA_RUNTIME.md) for Hatchery startup.

## 2026-10-17 · 官方配置服务与媒体连接

- 完整迁入 Microduck `configd/`（同一固定提交 9136aa4），保留 Apache-2.0 许可、模块和原 systemd 参考文件。路径依赖适配 v2，新增 board-runtime binary 门控；Web 复用官方 NetworkManager / BlueZ，增加无线开关、断开、通用设备枚举及按 MAC 操作。已保存网络复用 NM ActivateConnection，WPA3 按扫描结果使用 SAE。逐文件来源见 docs/UPSTREAM_IMPORT.json。
- `web/prototype/camera-stream.js` 的信令、SDP / ICE 和视频轨道处理改编自同提交 `mediad/webclient/index.html`，Apache-2.0；只接收视频与 media.video，不发送机器人控制调用。
- `mediad/src/rkaiq.rs` 的报文、校验与参数结构改编自 Rockchip SDK，Copyright 2019–2021 Rockchip Corporation，Apache-2.0。固定来源为 Rockchip Toybrick 官方仓库与 Khadas 厂商镜像，具体原文件、提交和 SHA256 见 docs/RKAIQ_IMPORT.json。没有迁入新的 ISP 算法或整套厂商运行时，继续使用板上 rkaiq_3A_server。
