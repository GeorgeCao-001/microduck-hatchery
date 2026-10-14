# Microduck Hatchery 运行与部署

Radxa Zero 3W 是整机主平台，电脑维护是辅助入口。已提供 [radxa/](radxa/) 的显式设备配置、未确认标定示例、sysusers 和维护单元；robotd / mediad 单元保留在对应 crate 内。构建与启动步骤见 [Radxa 指南](../docs/RADXA_RUNTIME.md)。本轮没有安装或启动板端服务，没有上板或 WiFi/USB/BLE 实测。

在仓库根目录启动已有只读样例工具：

```powershell
python scripts/hatchery-shell.py --port 8080
```

入口与依赖说明见 [tools/hatchery-shell/](../tools/hatchery-shell/README.md)。该工具只监听 loopback、提供样例 API 和静态资源，不访问硬件或执行目标。`/shell/` 缺少前端脚本；传输检查与完整页面检查分别报告。

视觉原型可独立启动：

```powershell
python web/tools/preview.py
```

按 [架构 v2](../docs/microduck-hatchery-architecture-v2.md) 保留 crate 内 systemd、顶层 [scripts/](../scripts/README.md) 和 [hooks/](../hooks/README.md) 的职责。当前单元使用 `/opt/microduck-hatchery` checkout 的 release binary，不自动 enable，不包含 OTA / provision / HAT 安装逻辑。

电脑只读维护使用 `python scripts/hatchery-maintenance.py --fixture`，提供 loopback 同源 Web / RPC，测试夹具不打开串口。它不是 Radxa 网络部署或完整 robotd / mediad，操作和验收范围见 [维护后端](../docs/MAINTENANCE_BACKEND.md)。

实际目标是 Radxa Zero 3W / FT。后续核对系统镜像、设备节点与权限、配置/校准位置、总线所有者、校准与 robotd 的互斥启动、健康检查、断线和恢复流程，不默认官方 HAT、摄像头、ToF 或串口路径。

发布文件、设备配置/校准、可变状态和 socket 分开。服务日志使用 journald，持久性须实测；仓库 [logs/](../logs/README.md) 不替代板端日志。设备路径无默认值，维护与 robotd 单元互斥；本轮未部署或连接硬件。
