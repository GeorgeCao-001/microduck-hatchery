# Microduck Hatchery 运行与部署

当前只提供本地启动约定。正式设备服务、安装脚本、systemd 单元与发布包尚未引入，也没有机器人部署或 WiFi/USB/BLE 实测。

在仓库根目录启动已有只读样例工具：

```powershell
python scripts/hatchery-shell.py --port 8080
```

入口与依赖说明见 [tools/hatchery-shell/](../tools/hatchery-shell/README.md)。该工具只监听 loopback、提供样例 API 和静态资源，不访问硬件或执行目标。`/shell/` 缺少前端脚本；传输检查与完整页面检查分别报告。

视觉原型可独立启动：

```powershell
python web/tools/preview.py
```

正式部署按 [架构 v2](../docs/microduck-hatchery-architecture-v2.md) 保留 crate 内部 systemd 等资源、顶层 [scripts/](../scripts/README.md) 和 [hooks/](../hooks/README.md) 的职责。源码分类路径与二进制安装路径分别核对，不现在生成假 unit 或空钩子。

实际目标是 Radxa Zero 3W / FT。后续核对系统镜像、设备节点与权限、配置/校准位置、总线所有者、校准与 robotd 的互斥启动、健康检查、断线和恢复流程，不默认官方 HAT、摄像头、ToF 或串口路径。

发布文件、设备配置/校准、可变状态和临时 socket 分开。设备运行日志使用选定系统机制，其重启/断电持久性须实测；仓库 [logs/](../logs/README.md) 不替代设备日志系统。本轮没有部署、安装新依赖或连接硬件。
