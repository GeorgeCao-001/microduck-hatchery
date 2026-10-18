# padd

手柄输入转为 robot intent 的预留位置。输入通过共享协议进入 robotd，不直接访问电机总线。

完整官方 crate 已迁入，复用 pad-map / pad-imu，通过 ARM64 类型检查；未部署，手柄兼容性和输入链仍待实测。
