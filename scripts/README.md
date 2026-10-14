# 工程与设备脚本

预留 provision、install、开发与 duck-sim 等工程脚本的位置。未来按实际 Radxa Zero 3W 环境核对路径、权限与部署前提，不默认官方板卡和设备节点。

板端入口：[setup-gstreamer.sh](setup-gstreamer.sh) 复用官方媒体依赖安装脚本；[build-radxa.sh](build-radxa.sh) 做 Linux ARM64 原生构建；[run-radxa.py](run-radxa.py) 从显式配置启动 robot、media 或 maintenance。步骤见 [Radxa 指南](../docs/RADXA_RUNTIME.md)，这些脚本由操作者执行，不自动安装 HAT / UART / IMU / 策略。官方 provision、OTA hooks 和 duck-sim 尚未迁入。

现有 [hatchery-shell.py](hatchery-shell.py) 仅用于本地 JSON 样例工具；静态预览使用 [web/tools/preview.py](../web/tools/preview.py)，样例检查器位于 [tools/check_shell.py](../tools/check_shell.py)。

[hatchery-maintenance.py](hatchery-maintenance.py) 构建并启动 `robotd-maintenance` / `mediad-maintenance`，生成会话并统一停止进程；自身无串口代码。`--list-ports` 只枚举；`--port COM5 --baud 1000000` 为串口示例；`--ids 1` 是可选初始轮询，参数与标定可扫描 0–253。`--fixture` 明确 fake，默认未连接。输出 src/target/，`--release` 选 release，`--no-build` 复用已有 binary；Ctrl+C 统一停止。见 [维护后端](../docs/MAINTENANCE_BACKEND.md)。
