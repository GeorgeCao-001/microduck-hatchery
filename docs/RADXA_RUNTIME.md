# Radxa 摄像头与舵机运行入口

本轮目标是 Radxa Zero 3W 的摄像头和舵机代码迁移。保留官方 crate 和主循环；硬件测试由 George 在板上执行。本文件说明交付范围和启动方式，不把编译结果当作实机验收。

## 无外设的设备状态验证

George 已报告在 Radxa 上完成维护入口的 release 编译和 fixture 启动；这是用户提供的结果，不代表摄像头或舵机验收。当前没有外设，可以先核对板子身份和系统状态。新增设备接口需先将本轮代码同步到板子，再在仓库根目录重新启动：

```sh
# 先用 Ctrl+C 停止旧的维护进程
export HATCHERY_DEVICE_NAME="George-Radxa"
python3 scripts/hatchery-maintenance.py --release --fixture
```

服务仍只监听 loopback。Windows 的另一个终端保持 SSH 转发：

```powershell
ssh -N -L 8088:127.0.0.1:8088 duck@192.168.8.2
```

浏览器打开 `http://127.0.0.1:8088/#console/device`；核对主机名、aarch64、系统读数和板端网络接口。顶部应同时显示“后端已连接”与“fixture · 非硬件”。USB-C 当前只提供到板子的网络链路；设备页可备注“SSH 转发”，网页入口 localhost 不代表服务运行在 Windows。Wi-Fi / 蓝牙连接操作复用官方 configd，启动与范围见 [设备连接](DEVICE_CONNECTIONS.md)。设备状态缺测或旧后端 404 时按页面提示处理，不据此补入样例。

不设置显示名称也可运行，默认使用板端主机名；上述 `export` 仅影响当前 shell 及其启动的进程。未连接外设时保持 `--fixture`，不添加串口、动作或摄像头选项。

## 来源与范围

| 来源 | 固定提交 | 使用范围 |
|---|---|---|
| [Pollen Robotics Microduck](https://github.com/pollen-robotics/microduck/tree/9136aa4ee88e81edf2bcaf3527e90b65da25f1eb) | `9136aa4ee88e81edf2bcaf3527e90b65da25f1eb` | robotd、mediad、duck-control、IPC、参数、运动学、里程计、媒体像素库及必需传递依赖；官方版本 0.15.1 |
| [Microduck 飞特分支](https://github.com/fanhao375/microduck/tree/8db8f00c8fc5278d0bdf43f96934531c37ee2780) | `8db8f00c8fc5278d0bdf43f96934531c37ee2780` | 总线选择器和 FT RobotIo 适配形状 |
| [Microduck-kissqy](https://github.com/kissqy/Microduck-kissqy/tree/94328f5b43c8ac825c90f0e564e7d1b926cd770d) | `94328f5b43c8ac825c90f0e564e7d1b926cd770d` | `firmware/duck-control/src/feetech.rs` 中原生包、严格响应解码、串口独占与有界同步读取部分 |

上述 Rust 固件部分为 Apache-2.0，原许可保留在各 crate 的 `LICENSE-UPSTREAM`。kissqy 的 console、训练中控和其他个人非商业部分没有引入，也没有导入其 FT6 IMU 固件、策略权重或发布包。原文件哈希、迁移路径与修改标记见 [UPSTREAM_IMPORT.json](UPSTREAM_IMPORT.json)。来源作者的测试与本项目测试分开记录。

迁入模块以 crate 为单位保留内部布局。`pet-detect`、`sounds`、`duck-detect` 是官方 daemon 当前的编译依赖，音频、检测和策略运行保持关闭，不要求安装 ONNX/NPU 运行库。`test-support` 仅保留官方测试辅助代码；依赖 OTA updater 的集成测试不在本次范围。configd 已按新增授权迁入；updater、BLE、手柄、ToF 和 RL 尚未迁入。

## 尚未迁入与待完成项

以下为当前工作区核对结果（2026-10-11）。目录已建立不表示源码已迁入；本节集中记录剩余范围。

2026-10-18 的剩余迁移范围、候选新版本、新增 netpadd／pad-map／nfc 的审查、服务接入 Web 和逐项进度，统一见 [官方迁移执行计划](OFFICIAL_MIGRATION_EXECUTION.md)。本节列举的旧范围不表示这些新增模块被排除，也不表示本轮计划已完成源码迁移。

| 尚未迁入部分 | 用途与当前状态 |
|---|---|
| `src/daemons/updater` | OTA 更新、回滚与恢复；当前只有说明 |
| `src/daemons/btd`、`protocol/duck-ble` | BLE 服务和协议；当前只有说明 |
| `src/daemons/padd`、`src/libraries/pad-imu` | 手柄输入与手柄 IMU；当前只有说明，不是本机 LSM6DSV16X 适配 |
| `src/daemons/tof` | ToF 服务；当前只有说明 |
| `tools/robotctl`、`tools/duckctl`、`tools/duck-ether` | 命令行、桌面客户端与网络工具；当前只有说明 |
| `tools/xtask` | 官方工程构建、打包与发布工具；当前只有说明 |
| `hooks`、其余官方 scripts / deploy、CI | 完整 provision / install / OTA 生命周期和 CI 尚未迁入；已有的 Radxa 构建、启动、媒体依赖脚本与单元继续保留 |
| `spaces` | 官方示例应用；当前只有说明 |

依赖 updater 的 `robotd/tests/updater_gate.rs`、`robotd/tests/single_instance.rs` 未纳入当前 workspace，具体原因保留在 [导入清单](UPSTREAM_IMPORT.json)。

全栈主线中的仿真、RL、训练环境、标准策略导出和运行策略权重也尚未引入，`training/` 当前只有说明；训练来源需单独固定，不把它当作本轮官方 daemon 源码的一部分。源码中的 policy 模块和小型测试模型夹具不等于已经具备训练环境或可运行的 FT 策略。

以下是源码已有但仍需适配、接通或验收的部分：

| 部分 | 剩余工作 |
|---|---|
| FT 整机运控 | 确认 HD 固件 / 寄存器 / 单位，完成增益、装机零位 / 方向 / 限位、写入与安全闭环；当前只读 |
| 实际 IMU | 接入 LSM6DSV16X，核对接口、坐标与安装方向；不能套用官方 IMU200 或第三方 FT6 |
| Hatchery Web | 正式 robot.* 状态订阅待接通；传感器页 WebRTC 视频已接入，流式画面待上板验收；独立相机快照诊断页保留，原联调 / 曲线 / 3D 仍为样例 |
| Radxa 运行 | 原生链接、部署、相机画面、HD 同步读取、断线和串口互斥尚未实机验收；硬件测试由用户执行 |

后续软件优先补 FT 实际参数、装机控制和 IMU 接入，再完成正式 Web 通信；其余服务按需要逐步迁入。阶段安排见 [PLAN.md](PLAN.md)。

## 实际硬件边界

依据 `hardware/microduck_bom.xlsx` 和厂商资料：Radxa Zero 3W、HD-1910-C001、FE-URT2-C001、Radxa Camera8M219 / IMX219。BOM 的已购标记不代表装配或兼容性已验证。现有 LSM6DSV16X 模块不默认是官方 Dynamixel IMU200 或 kissqy FT6 模块；HAT 功能、GPIO、电源、UART 和相机节点不假定存在。

FT 差异留在 `duck-control/src/bus_feetech.rs`、`bus_feetech_wire.rs` 以及已有维护 bus / io 内。上层继续使用官方 `RobotIo` / safety / protocol；不新增驱动框架。总线选择器适配官方最新 `DynamixelIo::open` 签名，同步结果按运行时 ID 顺序重排，不依赖回复顺序。

三种顺序独立：显示左腿 20–24 → 右腿 10–14 → 头颈/嘴 30–34；运行时左腿 → 头颈/嘴 → 右腿；策略顺序从运行时去掉嘴部 34，为 14 维。标定 JSON 的 15 项必须按运行时顺序。示例 2048、方向 +1 只是未确认占位，不能设成已标定来代替测量。

## 两种舵机入口

| 入口 | 用途 | 当前控制边界 |
|---|---|---|
| `robotd-maintenance` + `mediad-maintenance` | 任意 ID 的原始寄存器与单颗台架调试；ID 1 无需分配物理关节 | 延用现有会话、期限、去重和 SRAM 白名单；默认只读，显式选择参考 profile 后才允许受限原值动作 |
| `robotd` | 保留官方主循环、Unix RPC、安全层及 15 关节运行模型 | FT 本轮只读，不启用策略、输出、自动替换 ID、EEPROM 或增益调整；缺少标定时 joints / targets / FK 不发布伪造角度 |

两个入口不能同时持有总线：systemd 互斥，FT 串口使用 OS 独占。FD1985 和其他校准工具也必须先退出串口。维护模式不绕过 robotd：页面 → gateway → 维护 RPC → robotd 执行队列 → duck-control。正式 `robot.*` API 与维护 API 分开命名，前端不是权威控制器。

FT 运行端没有真实 IMU，`imu_ready=false` 且不发布默认姿态为测量；未知速度/电流比例不换算成物理单位。确认零位和方向后才发布关节 radians。原始字节及参考 ticks / raw load 继续在维护界面查看。release 不是急停，写入确认不是物理到位，不自动重放旧目标。完整装机运控仍需 FT 增益、限位、IMU、安全与匹配策略的后续工作。

## 板端构建

使用 64 位 Linux。建议先在 Radxa 的当前镜像上构建，避免 Windows 二进制或错误 sysroot 被送上板。Rust 固定 `1.99.0`，GStreamer 开发库最低 1.22；软件编解码回退不等于硬件加速已通过验收。

```sh
rustup toolchain install 1.99.0 --profile minimal
sudo sh scripts/setup-gstreamer.sh --dev
sh scripts/build-radxa.sh
```

`setup-gstreamer.sh` 来自上述官方提交，安装媒体依赖、带校验的固定 v3 插件以及 Rockchip 用户态库，并配置现存 VPU/RGA 节点权限；不会配置 HAT、舵机 UART、IMU、策略或相机 overlay。仅由操作者执行。它面向 Debian/Armbian 的 apt 系统；其他镜像需先核对软件包与驱动。`build-radxa.sh` 仅构建四个二进制，不安装或启动服务；2 GB 板默认单任务构建，可设 `HATCHERY_BUILD_JOBS`。

相机 overlay 依 [Radxa 官方相机说明](https://docs.radxa.com/en/zero/zero3/accessories/camera) 用 `rsetup` 选择实际 IMX219 / Camera8M219 配置并重启。然后由操作者确认节点：

```sh
ls -l /dev/serial/by-id/
v4l2-ctl --list-devices
media-ctl -p
```

`/dev/video0`、`/dev/ttyS2` 和 USB 名称都没有写死为 Hatchery 默认。FE-URT2 USB 优先填实际 `/dev/serial/by-id/...`；直接 UART 则填已核对接线、overlay 和权限的节点。相机应选择 ISP 可输出 NV12 的 capture 节点，不能把 sensor subdev 当 capture 节点。

## 配置与手动启动

将仓库放在 `/opt/microduck-hatchery` 或自己的开发路径。手动启动脚本能从任意工作目录运行；systemd 单元采用 `/opt/microduck-hatchery`。

```sh
sudo install -d /etc/robot
sudo install -m 0644 deploy/radxa/robotd.toml.example /etc/robot/robotd.toml
sudo install -m 0600 deploy/radxa/hatchery.env.example /etc/robot/hatchery.env
sudoedit /etc/robot/hatchery.env
```

填好 `HATCHERY_SERIAL_PORT`、`HATCHERY_CAMERA_DEVICE`；维护入口的 `HATCHERY_SERVO_IDS` 是可选初始轮询名单，也可留空后在参数与标定扫描。只有 ID 1 时保留 `HATCHERY_SERVO_IDS=1`，使用维护入口；整机 `robotd` 会等待全部 15 个运行时 ID。默认不开台架写入、不自动配置传感器、不启用云端 relay。`HATCHERY_CONFIGURE_SENSOR=1` 才启用上游 IMX219 模式/曝光配置；这一步需先核对当前镜像的媒体拓扑和 V4L2 controls。

```sh
# 从仓库根目录，在实际拥有串口/video 权限的用户下启动。
python3 scripts/run-radxa.py maintenance
# 另一个终端，可独立启动摄像头。
python3 scripts/run-radxa.py media
# 15 个关节装好后，停止维护入口，再启动官方只读主循环。
python3 scripts/run-radxa.py robot
```

手动使用非 root 用户时，让该用户能读取 env 文件和实际设备节点，或用 `--env-file /path/to/user-readable/hatchery.env` 指定自己的配置；脚本不自行提权。以服务方式运行时 EnvironmentFile 由 systemd 读取。

手动启动的 socket 默认在用户的 `~/.local/state/microduck-hatchery/run/`；systemd 使用 `/run/robot/`。robot 与 media 必须以同一用户 / 相同 runtime 配置启动。可用 HATCHERY_ROBOT_SOCKET / HATCHERY_FRAME_SOCKET 显式覆盖，不把两种启动方式的 socket 混用。

端口默认监听板端 loopback，可在 Windows/macOS 通过 SSH 转发访问：

```sh
ssh -L 8088:127.0.0.1:8088 -L 8080:127.0.0.1:8080 -L 8443:127.0.0.1:8443 user@radxa-address
```

- `http://localhost:8088/#console/servos/parameters`：现有 Hatchery 舵机工作台。
- `http://localhost:8080/`：Hatchery 相机预览，每秒只读快照。
- `http://localhost:8080/frame`：官方媒体链路的 PNG 快照接口。
- `/reference`：保留的官方媒体控制台参考入口；Hatchery 的联调 UI 没有被替换。WebRTC 还需要 signalling 和 ICE 网络可达，HTTP 转发本身不证明视频 UDP 路径可用。

当前 Hatchery Web 的正式 `robot.*` 状态订阅仍待接入；传感器页已集成 WebRTC 接收，实机视频尚待验收。维护工作台与相机预览可独立运行。用户只确认台架裸机和参考表后，才在配置中设置 `HATCHERY_BENCH_CONTROL=1`；它不解锁整机策略或批量硬件动作。

## 可选 systemd 安装

以下是提供给板端操作者的命令，本轮未执行。先完成构建和配置，确保 `/opt/microduck-hatchery` 是该 checkout。

```sh
sudo install -m 0644 deploy/radxa/sysusers.d/robot.conf /etc/sysusers.d/robot.conf
sudo systemd-sysusers /etc/sysusers.d/robot.conf
sudo install -m 0644 src/daemons/robotd/systemd/robotd.service /etc/systemd/system/robotd.service
sudo install -m 0644 src/daemons/mediad/systemd/mediad.service /etc/systemd/system/mediad.service
sudo install -m 0644 deploy/radxa/systemd/hatchery-maintenance.service /etc/systemd/system/hatchery-maintenance.service
sudo systemctl daemon-reload
# 先用维护模式 + 相机；两个舵机服务只选择一个。
sudo systemctl start hatchery-maintenance mediad
```

不默认 enable 自启动；断线不会自动使能或恢复旧命令。服务日志使用 journald，仓库 logs 不替代板端运行日志。正式 robotd 只读验收时改为启动 `robotd`，其 Conflicts 会停止维护服务。官方安装、OTA hooks 和其他 daemon 未随本次迁入而自动部署。

## 验收边界

本团队本轮只做源码、路径、配置与编译核对，未运行测试、未安装板端服务、未访问相机或发送舵机目标。Radxa 的实际链接、相机画面/方向/帧率、HD 寄存器和单位、全 15 关节同步读取率、断线/重连、串口互斥和动作验收由 George 进行。Windows/macOS/Linux 三平台实测与稳定 50 Hz 不能由来源作者结果或 ARM64 `cargo check` 推断。

本地结果：Windows 两个维护 binary 构建通过；robotd / mediad 的 Linux ARM64 cargo check 通过。媒体检查使用 DOCS_RS 跳过 GStreamer / GLib 原生库探测，AWS-LC 的 ARM64 C 部分由本地 Zig 工具编译；这是源码类型检查，不是板端链接或运行结果。板端必须使用上述原生构建，不带 DOCS_RS。工具链和缓存仅在忽略的 .local/，不作为产品依赖或上板文件。

正式协议保留官方时钟语义：robot.state.t 是进程经过秒数，t_ns 是板端 CLOCK_MONOTONIC 纳秒；维护协议 *_unix_ms 才是 Unix 毫秒，相机页面显示浏览器接收时间。三者不能互相冒充采样时间。无真实 IMU 时 imu 为空 / health.ready=false，默认 odom、gravity、gain 等官方兼容字段不能当作实际测量，正式前端须结合能力与健康状态解释。

配置服务现已完整迁入，官方 systemd 单元仍为参考，未安装启用。Wi-Fi / 蓝牙前台启动见 [设备连接](DEVICE_CONNECTIONS.md)；RKAIQ 控制、视频端口与权限见 [相机实时参数](CAMERA_CONTROLS.md)。
