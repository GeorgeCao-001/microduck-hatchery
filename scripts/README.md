# 工程与设备脚本

预留 provision、install、开发与 duck-sim 等工程脚本的位置。未来按实际 Radxa Zero 3W 环境核对路径、权限与部署前提，不默认官方板卡和设备节点。

当前未导入官方 provision、install 或 duck-sim 脚本，没有可执行板端部署流程。现有 [hatchery-shell.py](hatchery-shell.py) 仅用于本地 JSON 样例工具启动；静态预览仍使用 [web/tools/preview.py](../web/tools/preview.py)，离线样例检查器位于 [tools/check_shell.py](../tools/check_shell.py)。

[hatchery-maintenance.py](hatchery-maintenance.py) 从 `src/` workspace 构建并启动 Rust robotd / mediad 的最小只读维护入口，生成会话凭证并统一停止进程；自身不实现串口通信。`--list-ports` 仅调用 robotd 枚举、不打开端口；`--port COM5 --ids 1 --baud 1000000` 是单颗台架设置示例。`--fixture` 是明确 fake，无参数默认未连接。默认输出 `src/target/`，`--no-build` 复用已构建程序；Ctrl+C 统一停止服务。Radxa 是整机主平台，电脑入口用于台架，使用与验收见 [维护后端](../docs/MAINTENANCE_BACKEND.md)。
