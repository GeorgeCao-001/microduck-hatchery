# Runtime source notices

Pollen Robotics Microduck non-servo source is pinned to `53230463927095ea890f231d29089bb0a538c06f` (0.17.6 / API 44). The retained `robotd` / `duck-control` FT implementation derives from `9136aa4ee88e81edf2bcaf3527e90b65da25f1eb` (0.15.1); only necessary state-constructor compatibility and read-only service observation changed in robotd. Imported crates retain Apache-2.0 `LICENSE-UPSTREAM`; ST's vendored ToF driver keeps its own BSD notices. Source-to-local paths, per-file origin revisions, hashes and modification flags are in [UPSTREAM_IMPORT.json](../docs/UPSTREAM_IMPORT.json).

The FT selector and RobotIo adapter derive from fanhao375/microduck, commit `8db8f00c8fc5278d0bdf43f96934531c37ee2780`, Apache-2.0. Native FT packet decoding and bounded reads derive from the Rust firmware portion of kissqy/Microduck-kissqy, commit `94328f5b43c8ac825c90f0e564e7d1b926cd770d`, Apache-2.0. Its separately licensed console, training tools, FT6 firmware and runtime policy weights were not imported. Existing maintenance transport retains its separate LICENSE-FT / NOTICE-FT attribution.

Hatchery changes: v2 crate paths, explicit runtime features and maintenance binaries, HD1910 read-only bus adaptation, calibration validity gates, read-only RPC admission, explicit camera nodes / sensor configuration, measured-intrinsics requirements, local-only media startup, Hatchery camera page, bounded live camera controls with shared exposure arbitration, and Radxa service configuration. These modifications and local builds do not attest to upstream or Hatchery hardware test results.

Original tests and tiny model fixtures belong to their source crates. Updater integration tests are now imported; installation and OTA execution remain pending. Parameter-editor tests retain the FT baseline defaults, including an explicit bus port and disabled limp-fall. Radxa runtime config and parameter-schema fixtures serve different purposes. Use [RADXA_RUNTIME.md](../docs/RADXA_RUNTIME.md) for Hatchery startup and the migration execution plan for the current validation scope.

## 2026-10-17 · 官方配置服务与媒体连接

- 完整迁入 Microduck `configd/`（同一固定提交 9136aa4），保留 Apache-2.0 许可、模块和原 systemd 参考文件。路径依赖适配 v2，新增 board-runtime binary 门控；Web 复用官方 NetworkManager / BlueZ，增加无线开关、断开、通用设备枚举及按 MAC 操作。已保存网络复用 NM ActivateConnection，WPA3 按扫描结果使用 SAE。逐文件来源见 docs/UPSTREAM_IMPORT.json。
- `web/prototype/camera-stream.js` 的信令、SDP / ICE 和视频轨道处理改编自同提交 `mediad/webclient/index.html`，Apache-2.0；只接收视频与 media.video，不发送机器人控制调用。
- `mediad/src/rkaiq.rs` 的报文、校验与参数结构改编自 Rockchip SDK，Copyright 2019–2021 Rockchip Corporation，Apache-2.0。固定来源为 Rockchip Toybrick 官方仓库与 Khadas 厂商镜像，具体原文件、提交和 SHA256 见 docs/RKAIQ_IMPORT.json。没有迁入新的 ISP 算法或整套厂商运行时，继续使用板上 rkaiq_3A_server。

- `mediad/rkaiq/` 复用 Rockchip 3A 服务及自带媒体枚举，固定 JeffyCN SDK 镜像 `bd19d1ee0d4c21945f156f75a8eb1cdafed2777a`，新增同进程 ISP21 API2 参数入口；用户试运行时替代原 3A 实例，不新增服务或算法库。服务及适配使用 Apache-2.0；`common/mediactl` 保留 LGPL-2.1-or-later，完整源文件、许可证和可重链接对象构建步骤一并保留。Gamma 验证网格 / 公式源于同提交官方 API2 实现。逐文件来源见 docs/RKAIQ_SERVER_IMPORT.json。

## 2026-10-18 · Non-servo upgrade and remaining source import

- Preserve all FT driver, motion, calibration and joint-mapping files; preserve the motor / policy / safety configuration region and v5 policy floor. Keep serialport 4.10.1. Protection hashes and reviewed exceptions are recorded in docs/MIGRATION_BASELINE.json.
- Import complete remaining service and tool crates, original Spaces, hooks and new deployment / CI source. Retain the categorized v2 paths and existing runtime feature gates; do not install or enable services. Packaging and installer integration remains pending.
- Reuse the official tof.stream / tof.frame exchange through mediad's existing WebRTC channel. The UI zone interpretation follows tof/src/lib.rs at the pinned revision; stale data is cleared, and board-origin data does not assert a hardware capture mode the protocol has not reported.
- Reuse the official media.detections notifications and SVG overlay in the camera view. The display switch does not start inference; raw detector scores are not presented as percentage confidence.
- The independently pinned RL / detector source trees and their licenses are recorded in docs/TRAINING_IMPORT.json. RL meshes retain CC BY-NC-SA-4.0 separately; no training, data/model download, publishing or FT actuator adaptation was performed.
- The device HTTP client delegates naming, build metadata and bounded journal reads to official configd system.* calls. Name persistence remains in configd's Store; journal access remains in configd's logs module. Hatchery adds same-origin HTTP admission, a fixed unit set, a 100-entry display limit and credential-line filtering. No new system service or installer was added.
- `robot_gateway.rs` and the shared browser runtime view use official Request / Call / Response, RobotState and HealthResult types with the retained robotd hello / robot.subscribe / robot.health handlers. The adapter keeps one bounded subscription cache and does not send motor intents. Capture mode is unreported, so the UI does not infer real hardware from transport origin. The retained source-checkout socket layout is preserved.

- Requested read-only feedback displays adapt official JOINT_NAMES / RobotState radians to local reference geometry; the sample tick conversion remains separate. `input_gateway.rs` subscribes only to the official padd tap and never sends an input or robot intent.
- `web/prototype/vision-tools.js` ports edges, motion and sparse flow from official `spaces/vision-demo/filters.py` at 5323046, Apache-2.0, using the pinned official OpenCV.js 4.13.0 documentation build. The local asset, Apache-2.0 license, version and hash are under `web/prototype/vendor/opencv/`; provenance is recorded in docs/UPSTREAM_IMPORT.json. Geometry uses published media.video intrinsics rather than the example's nominal camera constants.
