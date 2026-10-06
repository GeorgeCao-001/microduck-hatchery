# robotd

主控制进程的预留位置。未来统一管理运行模式、控制意图、权威状态和电机总线，通过 `duck-control` 执行控制与安全检查；Web gateway 不得另写总线或合成执行成功。

当前仅此说明文件，未导入源码，无 `Cargo.toml` 或 binary，未部署。控制循环频率与 FT / Feetech 实机兼容性尚未验证。
