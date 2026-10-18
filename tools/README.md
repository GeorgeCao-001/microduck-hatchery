# 开发与运维工具

按 [v2 架构](../docs/microduck-hatchery-architecture-v2.md)保留官方工具的完整 crate，归属 `src/Cargo.toml` workspace。来源与当前限制见 [迁移基线](../docs/MIGRATION_BASELINE.md)。桌面工具不在板端默认构建集合内。

| 位置 | 用途与当前状态 |
|---|---|
| `robotctl/` | 板端 Unix RPC 命令行工具。 |
| `duckctl/` | 桌面 BLE / 网络控制与诊断客户端。 |
| `xtask/` | 官方打包、签名与发布工具；发布链与 CI 尚未验收。 |
| `test-support/` | 官方跨模块测试支持库。 |
| `duck-ether/` | 模拟设备间无线广播的离线工具。 |
| [hatchery-shell/](hatchery-shell/README.md) | 现有只读 Python 样例工具，独立于正式设备架构。 |
| `check_shell.py` | 启动并关闭临时样例服务，检查本地 HTTP/WS 和静态资源。 |

## 本地样例检查

```powershell
python tools/check_shell.py --transport-only
```

这项检查覆盖样例 HTTP/WS、原型静态资源、15 关节映射、fake/sample 来源、写请求拒绝和断线后重新订阅。它明确排除未完成的 `/shell/app.js`，不能据此宣称样例检查页完整或真实设备可运行。默认 `python tools/check_shell.py` 保留完整资源检查，现阶段会暴露该既有缺口。

检查器复用已安装的 Python、Starlette、uvicorn 和 websockets，不自动安装依赖、不连接串口或机器人。`web/tools/preview.py` 仍只提供前端静态预览。

常驻样例服务使用 `python scripts/hatchery-shell.py --port 8080`，仅绑定 loopback，提供 `/` 原型、样例 HTTP/WS 与尚未完成的 `/shell/` 页面；它不是正式 gateway、robotd 或硬件控制器。
