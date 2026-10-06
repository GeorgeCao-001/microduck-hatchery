# mediad

板端媒体与 Web gateway 的预留位置。未来经共享协议 / RPC 与 robotd 通信，转发实际状态与结果，不充当第二个控制器。

来源 `mediad/webclient` 以后作为 crate 内部内容整体保留，用于控制语义与通信参考；顶层 `web/` 继续是 Hatchery 的调试、展示和教程前端，不复制官方 UI。

当前仅此说明文件，未导入源码，无 `Cargo.toml`、binary 或 `webclient`，未部署。Camera、Mic、WebRTC 和设备节点均需按实际硬件配置验证。
