# btd

BLE 通信入口的预留位置，契约由 `protocol/duck-ble` 管理，控制请求仍交由 robotd 裁定。BLE 能力与可用频率需实际验证。

完整官方 crate 与 duck-ble 已迁入，通过 ARM64 类型检查；未部署或验收蓝牙硬件。BLE 不承担高频运动控制。
