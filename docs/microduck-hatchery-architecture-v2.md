# microduck-hatchery 架构

## 1. 重构原则

- 只做浅层语义分类，不重新设计官方运行架构。
- 官方 crate 作为最小不可拆单元，crate 内部尽量保持原样。
- 不新增 `drivers/`、`runtime/`、`robot_io/`、`libs/` 等无必要抽象层。
- 国产硬件差异只在官方已有 seam 上做最小适配。
- crate 名、binary 名、systemd service 名尽量保持官方名称。

---

## 2. 推荐目录

```text
microduck-hatchery/
│
├─ src/
│  │
│  ├─ daemons/                    # 真正在板子上独立运行的进程
│  │  ├─ robotd/                  # 主控制进程、50 Hz loop
│  │  ├─ updater/                 # 更新服务
│  │  ├─ configd/                 # Wi-Fi / 系统配置
│  │  ├─ btd/                     # BLE 入口
│  │  ├─ padd/                    # 手柄 → robot intent
│  │  ├─ mediad/                  # Camera / Mic / WebRTC / 官方 Web
│  │  └─ tof/                     # ToF 服务
│  │
│  └─ libraries/                  # 被 daemon 调用，不独立运行
│     ├─ duck-control/             # bus / IMU / obs / policy / safety
│     ├─ robotd-params/            # robotd 参数 schema / 默认值 / 校验
│     ├─ kinematics/               # 运动学
│     ├─ odometry/                 # 里程计
│     ├─ sounds/                   # 声音生成
│     ├─ pet-detect/               # 触摸/声音检测
│     ├─ duck-detect/              # 摄像头中的 Microduck 检测
│     ├─ pad-imu/                  # 手柄 IMU 姿态计算
│     └─ uyvy/                     # Camera UYVY 像素与旋转处理
│
├─ protocol/
│  ├─ duck-ipc-proto/              # JSON-RPC / IPC wire contract
│  └─ duck-ble/                    # BLE wire contract
│
├─ tools/
│  ├─ robotctl/
│  ├─ duckctl/
│  ├─ xtask/
│  ├─ test-support/
│  └─ duck-ether/
│
├─ web/                            # Hatchery 增强调试 / 教程 Web
├─ training/                       # microduck_rl，内部尽量保持官方结构
├─ hardware/                       # Hatchery CAD / BOM / 电控 / STEP
│
├─ deploy/                         # 上板配置与部署文件
├─ hooks/                          # 更新包安装前后执行脚本
├─ scripts/                        # provision / install / dev / duck-sim 等脚本
├─ spaces/                         # 官方远程 Demo / Hugging Face Space 示例
└─ docs/
```

---

## 3. 官方模块对应关系

| 官方模块 | Hatchery |
|---|---|
| `robotd` | `src/daemons/robotd` |
| `updater` | `src/daemons/updater` |
| `configd` | `src/daemons/configd` |
| `btd` | `src/daemons/btd` |
| `padd` | `src/daemons/padd` |
| `mediad` | `src/daemons/mediad` |
| `tof` | `src/daemons/tof` |
| `duck-control` | `src/libraries/duck-control` |
| `robotd-params` | `src/libraries/robotd-params` |
| `kinematics` | `src/libraries/kinematics` |
| `odometry` | `src/libraries/odometry` |
| `sounds` | `src/libraries/sounds` |
| `pet-detect` | `src/libraries/pet-detect` |
| `duck-detect` | `src/libraries/duck-detect` |
| `pad-imu` | `src/libraries/pad-imu` |
| `uyvy` | `src/libraries/uyvy` |
| `duck-ipc-proto` | `protocol/duck-ipc-proto` |
| `duck-ble` | `protocol/duck-ble` |
| `robotctl` | `tools/robotctl` |
| `duckctl` | `tools/duckctl` |
| `xtask` | `tools/xtask` |
| `test-support` | `tools/test-support` |
| `duck-ether` | `tools/duck-ether` |
| `microduck_rl` | `training/` |

---

## 4. duck-control 不拆

官方 `duck-control/src` 保持平铺：

```text
duck-control/src/
├─ bus.rs
├─ fall.rs
├─ imu.rs
├─ io.rs
├─ lib.rs
├─ model.rs
├─ obs.rs
├─ pickup.rs
├─ policy.rs
├─ safety.rs
└─ sim.rs
```

FT / Feetech 适配优先发生在现有 `bus.rs` / `io.rs` seam 上，不另造 driver 层。

---

## 5. hooks

`hooks/` 是 OTA / 更新包安装生命周期脚本。

官方当前主要有：

```text
hooks/
├─ preinstall.in
└─ postinstall
```

用途：

- `preinstall`：正式替换版本前执行准备工作。
- `postinstall`：新版本安装后执行板端迁移、配置更新、资源安装等。
- 属于更新 / 部署机制，不属于实时运控主链。

Hatchery 若保留官方 updater 机制，应保留 `hooks/`。

---

## 6. spaces

`spaces/` 是官方用于远程 Demo / Web 应用 / Hugging Face Spaces 一类功能的目录，不是板载控制核心。

官方当前包括：

```text
spaces/
├─ hello/
├─ policy-playground/
├─ shared/
└─ vision-demo/
```

典型用途：

- `hello/`：最小远程应用示例。
- `policy-playground/`：策略交互 / 展示页面。
- `vision-demo/`：视觉流与远程处理 Demo。
- `shared/`：多个 Space 复用的代码。

它们不参与 `robotd -> duck-control -> motor` 的实时运控链。

如果 Hatchery 当前重点是本地机器人和本地 Web 调试，可以保留目录但不优先实现；以后做公网 Demo、远程展示或云端交互时再使用。
