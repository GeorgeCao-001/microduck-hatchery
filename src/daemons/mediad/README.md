# mediad

板端媒体与 Web gateway 的预留位置。未来经共享协议 / RPC 与 robotd 通信，转发实际状态与结果，不充当第二个控制器。

来源 `mediad/webclient` 以后作为 crate 内部内容整体保留，用于控制语义与通信参考；顶层 `web/` 继续是 Hatchery 的调试、展示和教程前端，不复制官方 UI。

当前已有最小 Rust 本机 gateway：同源提供 Hatchery 原型和只读 GET，通过共享维护 RPC 转发 robotd 实际回复；loopback、Host / Origin 和会话凭证限制，不依赖串口库或自行合成反馈。完整官方 mediad / webclient 尚未迁入，Camera、Mic、WebRTC、远程 Radxa gateway 和部署均未实现。运行见 [维护后端](../../../docs/MAINTENANCE_BACKEND.md)。
