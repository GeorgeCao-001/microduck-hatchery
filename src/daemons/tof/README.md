# tof

ToF 数据服务的预留位置。传感器型号、I2C / GPIO 路径与权限按 Hatchery 实际配置确定，不假定官方 Robot HAT 存在。

完整官方 crate 与 ST L5 / L8 ULD 已迁入，binary 为 `tofd`，通过 ARM64 类型检查。Web 复用官方 tof.stream；实际总线、模块和测距仍待用户验收，未部署或探测硬件。
