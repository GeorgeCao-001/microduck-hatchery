# 设备库

按 [v2 架构](../../docs/microduck-hatchery-architecture-v2.md) 分类，库被 daemon 调用，不另设运行进程；未来完整源码内部结构尽量保持。duck-control 当前已有 FT 只读 bus / io，其他库只有说明文件；完整整机实现与硬件验收尚未完成。

| 模块 | 预期职责 |
|---|---|
| [duck-control](duck-control/README.md) | 总线、IMU、observation、policy 与 safety |
| [robotd-params](robotd-params/README.md) | 参数 schema、默认值与校验 |
| [kinematics](kinematics/README.md) | 运动学 |
| [odometry](odometry/README.md) | 里程计 |
| [sounds](sounds/README.md) | 声音生成 |
| [pet-detect](pet-detect/README.md) | 触摸 / 声音检测 |
| [duck-detect](duck-detect/README.md) | 图像中的 Microduck 检测 |
| [pad-imu](pad-imu/README.md) | 手柄 IMU 姿态计算 |
| [uyvy](uyvy/README.md) | UYVY 像素与旋转处理 |

FT / Feetech、IMU 等实际硬件差异优先在既有 `duck-control/bus.rs`、`io.rs` 边界做最小适配，不新增 drivers framework，不向策略或 Web 扩散寄存器细节。
