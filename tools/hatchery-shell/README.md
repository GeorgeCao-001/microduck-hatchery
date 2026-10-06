# 只读开发样例工具

本目录是独立的 Python 只读样例工具，用于在未连接设备的情况下检查本地 HTTP/WS、固定 JSON 夹具与前端静态资源。它不替代 `robotd`、`duck-control`、`duck-ipc-proto` 或板端 Web/media gateway，不承担正式控制职责。

```text
tools/hatchery-shell/
├─ requirements.txt      现有 Starlette、uvicorn 版本记录
└─ device/               工具内部 Python 包
   ├─ __main__.py        loopback 样例服务入口
   ├─ api/               样例 HTTP/WS 与有限静态挂载
   ├─ controller/        样例会话、帧序号、拒绝写请求
   └─ adapters/          只读根 protocol/ 中的 JSON 夹具
```

## 启动与检查

在仓库根目录执行；入口也可从其他工作目录用脚本路径运行，资源路径按脚本位置定位。

```powershell
python scripts/hatchery-shell.py --port 8080
python tools/check_shell.py --transport-only
```

样例入口是 `http://127.0.0.1:8080/`，状态接口为 `GET /api/v1/info`、`GET /api/v1/state`、`WS /api/v1/ws`。服务只绑定 loopback；真实设备身份为 `null`，数据始终带 `sample/fake/read_only` 标志，所有控制能力禁用。`hatchery-shell/0` 仅是此工具的样例消息格式，不是正式 RPC 契约。

依赖复用本地已有 Python、Starlette 与 uvicorn；检查器另外使用已安装的 websockets。本次没有安装依赖。`requirements.txt` 保持现有版本记录，尚未记录检查器的 websockets 依赖，不能作为完整新环境锁文件。前端静态预览仍可独立运行 `python web/tools/preview.py`。

## 尚未完成的部分

- `web/shell/app.js` 尚未生成；完整默认检查会报告该资源缺失。`--transport-only` 只验证已存在的链路与资源，不验证样例检查页的 JavaScript/UI 完整性。
- 正式 `duck-ipc-proto`/RPC、硬件驱动、策略执行、控制授权、校准、限位和实机反馈均未接入。
- 样例 Schema 与实际消息仍有待独立核对的差异；本次目录整理没有修改协议字段或 Schema。
- 没有 FT robotd 启动器、策略执行或总线模式切换实现，也不启动任何设备进程。

## 硬件边界

正式路径按 [v2 架构](../../docs/microduck-hatchery-architecture-v2.md)为 Browser → board-side gateway → shared RPC → robotd → duck-control/safety → bus。本工具不承接真实 FT 串口访问或独立控制循环；FT 适配优先复用已有代码并在既有 `bus.rs/io.rs` 边界进行。

任何未来校准工具与 robotd 都必须遵守唯一总线所有权，读取也不能另起串口轮询竞争。模式切换先结束旧所有者并确认释放，再启动新所有者；进程内串口锁不能替代跨进程仲裁，`release` 不能当作停止或急停。
