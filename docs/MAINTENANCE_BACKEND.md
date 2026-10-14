# 舵机台架维护后端

## 当前设备与系统状态

设备页使用 `GET /api/v1/maintenance/device` → `maintenance.device` → robotd 的只读主机采集，协议为 `hatchery-device/1`。复用现有同源、会话 cookie 和 RPC 认证，接口不接受写入，不扫描舵机或占用串口。只有当前设备，没有多设备入口、发现或切换。

Radxa/Linux 从系统读取主机名、板卡型号、操作系统与内核、CPU 采样差值、内存、运行时间及网络接口；最高温度复用既有 `soc.rs`，代表可读 thermal zones 的最高值，不单独认定为 CPU 温度。地址通过已有 `ip -j address show` 读取；Wi-Fi / USB 类型属于接口识别，不能据此推断浏览器实际经过哪条链路。蓝牙显示系统枚举及可读的 rfkill 状态，不进行配对或配置。缺失工具、未提供字段、首次 CPU 采样和不支持的平台均保留缺测。

系统 `source=host-system` 与 `service.servo_source/servo_fake` 独立。因此 `--fixture` 可显示板子真实系统信息，同时明确舵机为假数据。网页约每 2 秒读取一次；超过 6 秒没有有效回复或请求失败时标为陈旧，保留上次身份并隐藏旧系统数值。协议时间为 Unix 毫秒，浏览器使用自己的单调时钟判断新鲜度。

设备名称默认采用主机名；板端可配置 `HATCHERY_DEVICE_NAME`，可选 `HATCHERY_DEVICE_ID`。未配置 ID 时 Linux 使用 machine-id 派生的展示标识，不返回原始 machine-id，也不作为认证凭据。设备页的显示名称和连接方式备注仅影响当前浏览器。顶部设备栏在所有调试页读取同一会话；静态预览不请求设备接口，不生成虚构的系统数值。

旧版二进制没有此接口，需要同步工作区代码并重新编译、重启维护服务。Radxa fixture 验证方式见 [Radxa 指南](RADXA_RUNTIME.md#无外设的设备状态验证)。本地 Windows 构建和只读 RPC / HTTP 契约已验证；Linux/ARM64 系统采集和实际板端连接仍由 George 验证。

## 轻量台架工作台（2026-10-11）

“参数与标定”统一承载扫描、选择 ID、舵机调节、参数和软件标定；`servo-device.js/css` 保留独立模块，已归类与未归类舵机都按总线 ID 操作。无需先给 ID 1 绑定关节；15 关节、runtime / policy 索引保持独立。前端维持原生 JS，后端仍为 gateway → RPC → robotd → duck-control，没有新增依赖或第二串口控制器。

可用的软件入口：原始寄存器回读（单次 1–32 字节）、实时原值反馈、12-bit 编码器参考角、目标滑块 / 数字 / ±32 counts 草稿、单颗限幅执行与输出开关。参考角按 counts × 360 / 4096 展示，不代表装机角度。反馈、自动刷新、切页及重连都不提交目标。

先关闭 FD 串口，在仓库根目录启动只读反馈：

```powershell
python scripts/hatchery-maintenance.py --port COM5 --baud 1000000 --reference-feedback
```

确认裸机台架和所选寄存器表适用后，可显式开放控制：

```powershell
python scripts/hatchery-maintenance.py --port COM5 --baud 1000000 --reference-feedback --bench-control --profile fd-hlsxx
```

打开 <http://127.0.0.1:8088/#console/servos/parameters>。页面还需勾选裸机与 profile 确认，再显式点击执行。macOS 用 python3 和实际枚举路径；Radxa 可复用这些模块，板端网络入口和硬件配置尚未部署验证。

`fd-hlsxx` 来自本地 FD1985 的 `ft_setup_bat/setup.log` HLSXX 表，是操作者选择的参考表，**不是自动识别或已核实的 HD 固件 profile**。控制资格不改成 `hardware_confirmed` / `register_profile_confirmed=true`。运动前实时读取模式 33、分辨率 30 和位置 56，要求模式 4、分辨率 1、当前位置 0–4095；单次目标只能在当前值 ±128 counts 内。速度 raw 1–200、加速度 raw 1–50，不承诺对应固定物理速度。开启输出前先对齐当前目标并回读；关闭输出会卸力，不能当急停。

常规台架写入为 SRAM 输出 40、加速度 41、位置 42、速度 46。HLS 地址 44 为目标扭矩，未当作另一系列的运动时间写入。另有明确的 ID 修改事务：先读 0–5 的实际身份，必须匹配本地 FD HLS 3.40–3.59 表；核对当前 ID、输出关闭、锁位 55 为 1，检查新 ID 无应答，再解锁、只写一次地址 5、读取新 ID 并恢复锁位。操作者必须确认只接一颗舵机，断电持久性仍须验收；不支持的固件会拒绝，不能以任意 FT 型号替代。没有其他 EEPROM、模式、持久偏移或固件写入，没有自动动作循环。完整参数恢复、批量控制、物理角标定和整机 safety 仍未完成。

`POST /api/v1/maintenance/command` 转发 `maintenance.command`，含 command_id、当前 session_id、最长 2 秒期限、bench_confirmed 和operation（单 ID 操作，或范围扫描 / 取消）。gateway 检查同源 Origin、会话 cookie、自定义请求头和 JSON 体积；robotd 有界排队，唯一 collector 串行执行，拒绝重复、过期、广播与保留 ID；0–253 的单机 ID 不再受启动名单或关节关联限制。状态区分拒绝、未确认及写入应答后回读一致，回读一致不等于物理到位。无自动重试、重连或历史目标重发；浏览器取消请求不能撤销已发出的单次写入。

本轮 Windows binary 构建与受影响 JS 语法检查通过；未执行运动或参数写入，未做 USB 动作及跨平台实机验收。以下旧只读章节描述默认模式及此前验收；本节仅新增显式台架能力。

Radxa Zero 3W 是 Hatchery 整机的主要运行平台。电脑上的 FD1985 经 FE-URT2 调试裸机或台架舵机；Hatchery 的电脑维护入口用于逐步提供同类能力，不改变整机运行平台。

```text
整机：电脑浏览器 → Radxa gateway → protocol / RPC → robotd → duck-control → FT 总线
台架：电脑浏览器 → 本机 gateway → protocol / RPC → robotd 维护入口 → duck-control → FE-URT2
```

电脑维护入口只加载必要的串口与协议能力；策略、IMU、相机及整机控制仍属于后续 Radxa 运行实现。FD1985、其他校准程序和 robotd 不得同时占用同一串口。

## 页面、选择与草稿

页面仅使用原有的左侧关节参数表与右侧详情，没有独立 USB 工作台。扫描 / 范围 / 查找位于表头；右侧统一选择实际 ID、关联关节，并在参数、软件标定、位置调节三个标签间切换。连接步骤保留在全局“连接说明”和本文。

设备 ID、固件内参数、零位 / 方向 / 限位及关联关系只在“参数与标定”修改。联调、单舵机、曲线、3D 读取同一份不可变配置视图，不能另行修改配置；运行目标草稿仍可在调试页编辑。显示 ID 与逻辑关节键、runtime / policy 索引分开。当前关联与软件标定属于浏览器会话草稿，其他页按草稿显示 ID / 标定配置，不改变真实运行时映射或使样例成为硬件数据。完整设备参数写入、权威标定提交及固件镜像升级尚未接通；已实现的 ID 事务仍由 robotd 核对和确认。

导航仅保留舵机下的联调、单舵机和参数与标定；旧维护地址重定向为参数与标定。关节选择与实际 ID 分开：15 个逻辑关节保持左腿、右腿、头颈嘴顺序，可把实际 ID 关联到当前关节草稿，也可选择“未关联”直接调试。关联不会写舵机 ID 或修改运行时 / 策略索引；同一实际 ID 不允许在关联草稿中重复分配。

参数及标定草稿按实际舵机 ID 保存；预标号和未关联设备调用同一组校验、换算、批量差异与导入导出逻辑。批量可选择 15 关节分组或已发现总线设备。反馈不会覆盖参数、目标或标定草稿；仅点击“实测位置 → 参考 counts 草稿”才填入参考位置，姿态角、方向、限位继续手动核对。角度预览标记为草稿换算，不发布为权威真实角度。JSON 包含设备草稿和关节关联，兼容旧单独草稿文件；整页刷新前先导出。

NDJSON 状态帧上限调整为 512 KiB，容纳完整 0–253 发现结果；命令仍使用短期限、有界队列和逐条确认。没有新增第三方依赖。

## 当前实现

2026-10-10，按已批准 FD1985 方案建立 4 个 Rust workspace 成员：

| 模块 | 已实现范围 |
|---|---|
| `protocol/duck-ipc-proto` | `hatchery-maintenance/1` 状态与维护 RPC，15 关节及独立 runtime / policy 索引 |
| `src/libraries/duck-control` | `bus.rs` 串口独占、PING 与固定参考窗口 READ；`io.rs` 原码与冻结参考解码 |
| `src/daemons/robotd` | 只读维护进程、唯一串口持有者、逐 ID 缺测与会话状态 |
| `src/daemons/mediad` | loopback 静态页面 / GET gateway，只转发 robotd 回复，不访问总线 |

本文描述的 robotd-maintenance / mediad-maintenance 是轻量维护入口，默认只读，显式台架动作见上节；无装机校准保存、完整租约、固件升级或策略循环。官方板端 robotd / mediad 和必要依赖已另行迁入，不改变维护协议；FT 整机只读、媒体及部署入口见 [Radxa 指南](RADXA_RUNTIME.md)。

## 本地启动

需要锁定的 Rust 1.99.0 工具链、该平台的链接工具和 Python 3。Python 启动器只构建 / 启停两个 Rust 进程，不实现串口通信；macOS / Linux 可使用 `python3`。

构建文件为 `src/Cargo.toml`、`src/Cargo.lock` 和 `src/rust-toolchain.toml`。启动器在 `src/` 中运行 Cargo，默认查找 `src/target/debug/`；自定义 `CARGO_TARGET_DIR` 的相对路径同样以 `src/` 为基准。以下 Python 命令在仓库根目录执行。

```powershell
python scripts/hatchery-maintenance.py --build-only
python scripts/hatchery-maintenance.py --fixture
```

打开 <http://127.0.0.1:8088/#console/servos/parameters>。`--fixture` 明确生成后端 fake 原码，不打开串口。去掉该参数则默认保持未连接，15 行均缺测；`--no-build` 复用已构建程序，`Ctrl+C` 停止两个服务。

参数与标定在现有表格和详情中展示维护快照；刷新只发 GET，不打开串口。原联调、反馈表、曲线与 3D 的浏览器样例保持独立，不能把这些界面解释为正在显示真实硬件。静态预览和 `file://` 入口不请求维护 API。

本机 Windows 使用隔离于 `.local/` 的官方 Rust 工具链及随工具链提供的链接器，没有修改全局 PATH。该目录不入 Git；新电脑正常安装锁定工具链及系统链接环境，不依赖 George 的路径。macOS 需可用的 Xcode Command Line Tools；Radxa 最终构建与发布路径按实际镜像另行确定。

## USB 台架真实连接

1. 给舵机独立供电、核对总线接线。在 FD1985 或其他程序中关闭对应串口；USB 识别适配器不等于舵机已经回复。
2. 运行 `python scripts/hatchery-maintenance.py --list-ports`。Windows 选择实际 COM 端口，macOS / Linux 使用枚举得到的路径，不套官方板卡设备节点。
3. 按 FD 已确认的 ID、波特率启动；下面是本机串口设置，启动后在网页扫描或查找 ID：

```powershell
python scripts/hatchery-maintenance.py --port COM5 --baud 1000000
```

4. 打开 <http://127.0.0.1:8088/#console/servos/parameters>，查看只读应答。静态 5173、样例服务 8080 和直接双击 HTML 都不是实际维护入口。
5. `Ctrl+C` 停止两个服务、释放串口，再使用 FD1985。打开失败不会接管其他程序；断线后必须显式重启。

`--ids` 是可选初始轮询名单，最多 254 个互不重复的 unicast ID（0–253）；省略时打开指定串口但不自动搜索。在参数与标定点击“扫描总线”可按当前波特率扫描 0–253 或自定子范围，状态返回范围、完成数、发现 ID 和取消状态。扫描只 PING，排除 254 广播 / 255 保留；由唯一 collector 逐 ID 执行，可在 ID 之间取消。扫描期间拒绝写入，已发现或手动查找成功的 ID 加入会话轮询；选择实际 ID 不要求先关联关节。未属于当前整机映射的 ID 单独进入 `unassigned_devices`；例如 ID 1 不会被假定为左髋。全量 15 关节及嘴部始终存在，未指定的关节显示缺测。默认 PING 回复没有位置负载，位置、角度留空。

2026-10-10 本团队实测：Windows 枚举到 COM5 / CH343，使用用户确认的 ID 1、1 Mbps，取得 PING 状态 0；source=hardware、fake=false、control_enabled=false。此前对整机预定 ID 的超时是配置范围不匹配，不能据此推断适配器或舵机损坏。这仅证明当前单颗舵机的只读通信，不证明 HD 专用寄存器、实际型号回读、物理角度或动作能力。

## 实际串口入口的边界

启动器只在显式 `--port` 和波特率配置下打开串口；`--ids` 可省略，网页负责发起明确的范围扫描。默认不自动扫描或猜设备节点。打开失败退出，不退回 fake；传输断开后放弃句柄，必须显式重启，不能自动接管或重发。

`--reference-feedback` 另行选择冻结 SCS 参考的地址 56 / 15 字节窗口。HD 专用寄存器表与实际固件未核对，此参数不是“HD 已适配”标志。原始字节保留，解码结果仅标 raw，不自动套电流、速度、电压或角度系数。来源与移植范围见 [FT 审核](FT_READ_ONLY_SOURCE.md)。

每颗成功回复记录主机 `received_unix_ms` 与本进程 `received_monotonic_ms`；不宣称舵机内置采样时间。`collected_monotonic_ms` 为本轮读取结束时间，`max_age_ms=1500` 仅是当前诊断展示有效期，不是运动安全期限。失败条目不保留上一次值或伪造时间。

状态明确含 source、fake、simulated、bus_owner、session_id、profile_id 与未确认校准标记。硬件串口打开不等于设备型号 / 固件确认；`hardware_confirmed`、`register_profile_confirmed` 仍为 false，`control_enabled` 仅在显式台架控制启动时为 true。

gateway 与 RPC 仅监听 loopback。启动器每次生成独立会话凭证，通过环境传递；浏览器使用 HttpOnly / SameSite=Strict cookie。状态和枚举仅 GET，另有受约束的 POST command；RPC 允许 state / ports / command。凭证和原始错误不作为运动确认。远程 Radxa 网络 gateway、认证和部署尚未实现。

## 验证与剩余工作

Windows 已构建真实 binary，并用显式 fixture 检查 RPC / HTTP 拒绝、映射、Web 展示及后端退出。Apple Silicon macOS 与 Linux ARM64 的检查结果见 [实际状态](../web/docs/LOCAL_STATUS.md#2026-10-10-fd1985-阶段-c只读后端基础)；源码检查不能代替目标系统链接、运行和 USB 实测。Intel macOS 未验收。

```powershell
cd src
cargo test --workspace --locked
cd ..
python tools/test-support/maintenance_contract.py
node --test web/tests/servo-backend.test.cjs
```

下一步核实实际 ID / 固件 / HD 寄存器表，再分别验收 Windows、macOS、Radxa 的真实只读、独占、超时、拔插与权限。`serialport` 当前关闭 Linux 默认 libudev feature，枚举中的 USB 元数据可能不完整；稳定设备识别需在实机补验。装机真实角度、完整参数写入和批量硬件执行仍待后续验收。
