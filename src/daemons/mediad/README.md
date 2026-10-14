# mediad

板端媒体与 Web gateway。官方 V4L2 / GStreamer、帧 socket、快照、WebRTC 和 RPC 转发源码已迁入；经共享协议连接 robotd，不充当第二个控制器。mediad binary 需 `board-runtime` 和板端媒体依赖。

来源 webclient/ 保留在 crate 内作为通信参考，显式 `/reference` 才提供其页面；顶层 web/ 继续是 Hatchery 前端。媒体根页面使用 Hatchery 浅色只读相机预览，`/frame` 返回官方链路的 PNG 快照。

相机节点必须显式指定，IMX219 模式 / 曝光配置 opt-in；默认不连接云端 relay / TURN，无实测标定不发布内参。配置见 [Radxa 指南](../../../docs/RADXA_RUNTIME.md)，画面、权限、编码和网络尚待上板验收；正式 Hatchery 状态订阅与视频整合仍待实现。

`mediad-maintenance` / `maintenance_main.rs` 保留轻量 loopback gateway，同源提供原型，状态 / command 仅转发维护 RPC 实际结果；保留 Host / Origin、会话、JSON 和请求头限制，无串口访问。见 [维护后端](../../../docs/MAINTENANCE_BACKEND.md)。
