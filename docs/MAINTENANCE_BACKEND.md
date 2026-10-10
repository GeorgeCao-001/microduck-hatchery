# 舵机只读维护后端

Radxa Zero 3W 是 Hatchery 整机的主要运行平台。电脑上的 FD1985 经 FE-URT2 调试裸机或台架舵机；Hatchery 的电脑维护入口用于逐步提供同类能力，不改变整机运行平台。

```text
整机：电脑浏览器 → Radxa gateway → protocol / RPC → robotd → duck-control → FT 总线
台架：电脑浏览器 → 本机 gateway → protocol / RPC → robotd 维护入口 → duck-control → FE-URT2
```

电脑维护入口只加载必要的串口与协议能力；策略、IMU、相机及整机控制仍属于后续 Radxa 运行实现。FD1985、其他校准程序和 robotd 不得同时占用同一串口。

## 当前实现

2026-10-10，按已批准 FD1985 方案建立 4 个 Rust workspace 成员：

| 模块 | 已实现范围 |
|---|---|
| `protocol/duck-ipc-proto` | `hatchery-maintenance/1` 状态与只读 RPC，15 关节及独立 runtime / policy 索引 |
| `src/libraries/duck-control` | `bus.rs` 串口独占、PING 与固定参考窗口 READ；`io.rs` 原码与冻结参考解码 |
| `src/daemons/robotd` | 只读维护进程、唯一串口持有者、逐 ID 缺测与会话状态 |
| `src/daemons/mediad` | loopback 静态页面 / GET gateway，只转发 robotd 回复，不访问总线 |

这是 Hatchery 的最小只读子集，不是完整官方 daemon 的迁入或桌面移植。没有运动、参数写入、校准保存、控制租约、固件升级、策略循环或媒体实现，不能部署为整机控制器。其他预留 crate 仍只有说明文件。

## 本地启动

需要锁定的 Rust 1.99.0 工具链、该平台的链接工具和 Python 3。Python 启动器只构建 / 启停两个 Rust 进程，不实现串口通信；macOS / Linux 可使用 `python3`。

构建文件为 `src/Cargo.toml`、`src/Cargo.lock` 和 `src/rust-toolchain.toml`。启动器在 `src/` 中运行 Cargo，默认查找 `src/target/debug/`；自定义 `CARGO_TARGET_DIR` 的相对路径同样以 `src/` 为基准。以下 Python 命令在仓库根目录执行。

```powershell
python scripts/hatchery-maintenance.py --build-only
python scripts/hatchery-maintenance.py --fixture
```

打开 <http://127.0.0.1:8088/#console/servos/maintenance>。`--fixture` 明确生成后端 fake 原码，不打开串口。去掉该参数则默认保持未连接，15 行均缺测；`--no-build` 复用已构建程序，`Ctrl+C` 停止两个服务。

维护页独立展示快照与串口枚举；刷新只发 GET，不打开串口。原联调、反馈表、曲线与 3D 的浏览器样例保持独立，不能把这些界面解释为正在显示真实硬件。静态预览和 `file://` 入口不请求维护 API。

本机 Windows 使用隔离于 `.local/` 的官方 Rust 工具链及随工具链提供的链接器，没有修改全局 PATH。该目录不入 Git；新电脑正常安装锁定工具链及系统链接环境，不依赖 George 的路径。macOS 需可用的 Xcode Command Line Tools；Radxa 最终构建与发布路径按实际镜像另行确定。

## USB 台架真实连接

1. 给舵机独立供电、核对总线接线。在 FD1985 或其他程序中关闭对应串口；USB 识别适配器不等于舵机已经回复。
2. 运行 `python scripts/hatchery-maintenance.py --list-ports`。Windows 选择实际 COM 端口，macOS / Linux 使用枚举得到的路径，不套官方板卡设备节点。
3. 按 FD 已确认的 ID、波特率启动；下面是本机单颗 ID 1 的设置：

```powershell
python scripts/hatchery-maintenance.py --port COM5 --ids 1 --baud 1000000
```

4. 打开 <http://127.0.0.1:8088/#console/servos/maintenance>，查看只读应答。静态 5173、样例服务 8080 和直接双击 HTML 都不是实际维护入口。
5. `Ctrl+C` 停止两个服务、释放串口，再使用 FD1985。打开失败不会接管其他程序；断线后必须显式重启。

`--ids` 指定最多 32 个互不重复的 unicast ID（0–253），只读轮询这些 ID，不自动扫描。未属于当前整机映射的 ID 单独进入 `unassigned_devices`；例如 ID 1 不会被假定为左髋。全量 15 关节及嘴部始终存在，未指定的关节显示缺测。默认 PING 回复没有位置负载，位置、角度留空。

2026-10-10 本团队实测：Windows 枚举到 COM5 / CH343，使用用户确认的 ID 1、1 Mbps，取得 PING 状态 0；source=hardware、fake=false、control_enabled=false。此前对整机预定 ID 的超时是配置范围不匹配，不能据此推断适配器或舵机损坏。这仅证明当前单颗舵机的只读通信，不证明 HD 专用寄存器、实际型号回读、物理角度或动作能力。

## 实际串口入口的边界

启动器只在显式 `--port`、`--ids` 和波特率配置下打开串口；默认硬件读取只 PING 指定 ID，不全总线扫描或猜设备节点。打开失败退出，不退回 fake；传输断开后放弃句柄，必须显式重启，不能自动接管或重发。

`--reference-feedback` 另行选择冻结 SCS 参考的地址 56 / 15 字节窗口。HD 专用寄存器表与实际固件未核对，此参数不是“HD 已适配”标志。原始字节保留，解码结果仅标 raw，不自动套电流、速度、电压或角度系数。来源与移植范围见 [FT 审核](FT_READ_ONLY_SOURCE.md)。

每颗成功回复记录主机 `received_unix_ms` 与本进程 `received_monotonic_ms`；不宣称舵机内置采样时间。`collected_monotonic_ms` 为本轮读取结束时间，`max_age_ms=1500` 仅是当前诊断展示有效期，不是运动安全期限。失败条目不保留上一次值或伪造时间。

状态明确含 source、fake、simulated、bus_owner、session_id、profile_id 与未确认校准标记。硬件串口打开不等于设备型号 / 固件确认；`hardware_confirmed`、`register_profile_confirmed` 和 `control_enabled` 当前始终 false。

gateway 与 RPC 仅监听 loopback。启动器每次生成独立会话凭证，通过环境传递；浏览器使用 HttpOnly / SameSite=Strict cookie。gateway 检查 Host / Origin，拒绝非 GET；RPC 方法仅允许 `maintenance.state`、`maintenance.ports`。凭证和原始错误不作为运动确认。远程 Radxa 网络 gateway、认证和部署尚未实现。

## 验证与剩余工作

Windows 已构建真实 binary，并用显式 fixture 检查 RPC / HTTP 拒绝、映射、Web 展示及后端退出。Apple Silicon macOS 与 Linux ARM64 的检查结果见 [实际状态](../web/docs/LOCAL_STATUS.md#2026-10-10-fd1985-阶段-c只读后端基础)；源码检查不能代替目标系统链接、运行和 USB 实测。Intel macOS 未验收。

```powershell
cd src
cargo test --workspace --locked
cd ..
python tools/test-support/maintenance_contract.py
node --test web/tests/servo-backend.test.cjs
```

下一步核实实际 ID / 固件 / HD 寄存器表，再分别验收 Windows、macOS、Radxa 的真实只读、独占、超时、拔插与权限。`serialport` 当前关闭 Linux 默认 libudev feature，枚举中的 USB 元数据可能不完整；稳定设备识别需在实机补验。实机角度和任何写入继续留在后续标定与有限控制阶段。
