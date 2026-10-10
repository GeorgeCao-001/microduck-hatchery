# Microduck Hatchery

Microduck 整机复刻项目，覆盖机械与电气、运控、仿真与 RL、标准策略导出、FT 运行时、实机验证，以及开发、调试、展示和教程前端。

架构主要依据 [架构 v2](docs/microduck-hatchery-architecture-v2.md)，保留 Pollen Robotics 官方 Microduck 的运行职责和完整 crate 边界，硬件适配以 **Radxa Zero 3W + FT / Feetech** 的实际配置为准。

**Radxa Zero 3W 是整机的主要运行平台；电脑上的 FD1985 / FE-URT2 用于台架舵机维护。** 已建立最小 Rust 只读维护 workspace，Windows binary 和测试夹具链路可运行；完整官方运行源码、Radxa 部署、真实舵机通信与校准尚未完成。目录存在不表示模块已经实现。

## 当前状态

| 部分 | 已有内容 | 尚未完成 |
|---|---|---|
| 设备软件与协议 | 保留 v2 目录；4 个可构建 Rust crate、只读 robotd / gateway、FT 原码边界与维护 RPC；原样例 JSON | 完整整机源码、板端网络 gateway、HD 固件 / 寄存器确认、真实读取与 Radxa 部署 |
| Hatchery Web | 原生原型、只读 3D 与 15 关节长滑块、紧凑反馈表 / CSV、单舵机工作台和独立曲线；HD 参考角、参数 / 标定草稿与批量；独立本机只读诊断快照 | 总控界面、实机校准 / 模型映射、完整 FD 调试与维护、正式记录、生产构建；生产前端栈尚未冻结 |
| 教程 | 当前原型仍为六章结构，七章全栈方案已整理为审查稿 | 七章页面及完整教程内容，须先共同审查 |
| 本地工具 | Python 静态预览、独立的只读 HTTP/WS 样例服务与检查脚本 | 诊断页 `app.js`、schema 对齐、完整的新环境依赖清单 |
| 硬件 | BOM 采购与选型记录、厂商规格书、照片及 CAD | 实际装配与接口配置核实、校准、上电和实机验收 |
| 训练与部署 | `training/`、`deploy/` 等职责说明与阶段计划 | 仿真、RL、标准导出、FT 策略闭环及部署实现 |
| 参考资料 | 官方 docs 的固定提交快照、来源与许可说明 | 官方文档仅作参考，不代表本项目已经实现或验证 |

原型与 Python 服务的数据均为样例；实机操作按钮保持禁用。已有本地验证的具体范围见 [实际状态](web/docs/LOCAL_STATUS.md)，来源作者结果与本团队验证分别记录。

## 目录与控制边界

```text
microduck-hatchery/
├─ src/
│  ├─ Cargo.toml     Rust workspace 与 path dependency
│  ├─ Cargo.lock     锁定依赖
│  ├─ rust-toolchain.toml
│  ├─ daemons/       robotd、mediad 等设备服务
│  └─ libraries/     duck-control 等控制与支撑库
├─ protocol/         duck-ipc-proto、duck-ble；样例映射、消息与 schema
├─ tools/            官方工具位置、hatchery-shell 样例与检查工具
├─ web/              Hatchery 前端、原型、资源和设计参考
├─ hardware/
│  ├─ microduck_bom.xlsx
│  └─ vendor_docs/   厂商资料、照片与 CAD
├─ training/         仿真、RL、评估与标准策略导出
├─ deploy/           部署配置与说明
├─ hooks/            安装钩子位置
├─ scripts/          本地启动入口与后续工程脚本
├─ spaces/           示例位置
├─ docs/             本项目文档及隔离的官方参考快照
└─ logs/             开发记录与日志规则
```

正式控制链路的目标是：

```text
Browser / Hatchery Web
  → 板端 Web / media gateway
  → shared protocol / RPC
  → robotd
  → duck-control / safety
  → motor bus
```

`web/` 只负责页面、目标草稿、展示缓存和只读回放。控制权、校准、限位、执行与确认由 `src/` 中的对应模块裁定。官方 `mediad/webclient` 作为通信与控制语义参考，Hatchery 保留自己的 UI。

Rust 构建文件统一位于 `src/`；workspace 只包括 duck-ipc-proto、duck-control、robotd、mediad 的最小只读子集，源码和顶层协议位置保持架构 v2。其他模块仍是说明位置。电脑维护后端与 Radxa 整机共用这些职责边界，完整整机源码迁移仍须核对 path dependency、脚本与部署路径。详见 [架构与边界](docs/ARCHITECTURE.md)。

## 本地运行

在仓库根目录执行。以下命令使用已有 Python；Linux/macOS 可使用 `python3`，不代表已完成这些平台的验收。

### 静态原型

只使用 Python 标准库，无第三方运行依赖：

```powershell
python web/tools/preview.py
```

打开 <http://127.0.0.1:5173/>。端口占用时加 `--port 5174`，用 `Ctrl+C` 停止。

### 只读样例服务

本机已有 Starlette / uvicorn 时运行：

```powershell
python scripts/hatchery-shell.py --port 8080
```

打开 <http://127.0.0.1:8080/> 查看原型。样例接口包括：

- `GET /api/v1/info`
- `GET /api/v1/state`
- `WS /api/v1/ws`

服务仅监听 loopback，显式标记 sample / fake / read-only，拒绝控制请求，不访问硬件。**原型目前没有消费这些接口，同源提供页面不表示已经接通设备通信。** `/shell/` 诊断页缺少 `app.js`，尚不能完整使用。

样例传输检查：

```powershell
python tools/check_shell.py --transport-only
```

检查脚本需要 `websockets`；当前依赖清单尚未完整列出检查与 WS 所需依赖。此检查覆盖样例 HTTP/WS、只读拒绝及静态资源；默认完整检查仍会因诊断页脚本缺失失败，schema 与实际消息也有待对齐。运行细节见 [样例工具说明](tools/hatchery-shell/README.md)。这些检查不构成实机验收。

### 本机只读维护后端

需要 Rust 1.99.0 及该平台的链接环境；Python 只负责启动两个 Rust 程序：

```powershell
python scripts/hatchery-maintenance.py --fixture
```

打开 <http://127.0.0.1:8088/#console/servos/maintenance>。`--fixture` 是明确的 fake 原码夹具；不提供 `--fixture` 或 `--port` 则保持未连接。原联调、曲线与 3D 仍为浏览器样例。

USB 台架实际连接：先给舵机供电并在 FD1985 中关闭串口，再按实际端口、ID、波特率启动。下面是本机单颗 ID 1 的设置示例，其他电脑以枚举结果为准：

```powershell
python scripts/hatchery-maintenance.py --list-ports
python scripts/hatchery-maintenance.py --port COM5 --ids 1 --baud 1000000
```

仍打开上面的 **8088 维护网页**，静态预览 5173 或直接双击 HTML 不连接设备。默认只 PING；ID 1 独立显示为“未分配关节的舵机”，不会自动绑定到整机的 15 关节。2026-10-10 已实测 Windows / COM5 / 1 Mbps 下 ID 1 成功应答；位置原码、HD 寄存器、实际角度与控制仍待核对，没有发送目标或参数写入。`Ctrl+C` 停止后端并释放串口；使用与平台验收见 [维护后端](docs/MAINTENANCE_BACKEND.md)。

## 硬件与实现约束

采购与选型见 [BOM](hardware/microduck_bom.xlsx)，规格书、照片和本地 CAD 见 [厂商资料](hardware/vendor_docs/)。CAD 已加入 `.gitignore`，保留在本地；后续再决定通过 Release 或外部链接分发。BOM 中的“已购”是采购记录，不能替代安装、兼容性或上电验收；采购数量也不能当作关节数量。即使有 HAT 资料和采购记录，仍须核对实际板卡、接线与可用功能。

- 保留全部 **15 个物理关节，包括嘴部 #34**。显示顺序为左腿 → 右腿 → 头颈嘴；物理运行时顺序与 14 维策略顺序独立维护，IMU 不计作关节。
- 迁移前先复查已有 FT 代码，优先利用 `bus.rs` / `io.rs` 边界适配；寄存器与串口细节不进入 policy、observation 或 Web。设备节点按 Radxa 实物与镜像核实。
- 总线只由当前活动后端占用，读操作同样需要仲裁。校准后端与 robotd 不能同时访问总线；`release` 不是急停，回放不发送历史目标。
- Web 沿用纸白、深绿黑、芥末黄、真实照片和技术文档风格。联调样例保留单关节入口、草稿与反馈分离，加载姿态只改已选草稿；缺校准时镜像禁用，实机动作禁用。
- 仿真与 RL 属于整机和教程主线。Web 已按最新要求加入只读 3D 参考姿态，不做浏览器物理仿真或策略导入、转换、推理。模型和角度当前均属参考/演示，未验证实际 Radxa / FT 装配；[模型来源与许可](web/licenses/microduck-model-NOTICE.md)。WiFi、USB-C gadget 网络和 BLE 桥仍是目标能力，BLE 不默认承担高频运动控制。

## 阅读入口

| 用途 | 文档 |
|---|---|
| 架构依据与当前边界 | [架构 v2](docs/microduck-hatchery-architecture-v2.md)、[ARCHITECTURE](docs/ARCHITECTURE.md) |
| 接手背景与推进顺序 | [本地开发交接](Microduck-Hatchery-Local-Development-Handoff.md)、[PLAN](docs/PLAN.md) |
| Web 运行、状态与共同设计 | [Web README](web/README.md)、[Web 文档索引](web/docs/README.md)、[联调说明](web/docs/JOINT_COORDINATION.md)、[总控、七章与联调审查稿](web/docs/LOCAL_REVIEW_PROPOSAL.md) |
| HD 舵机调试扩展 | [FD1985 接入方案](web/docs/FD1985_INTEGRATION_PROPOSAL.md)、[只读维护后端](docs/MAINTENANCE_BACKEND.md)：B 已完成，C 软件基础可运行，硬件验收待完成 |
| 正式模块与本地样例 | [src](src/README.md)、[protocol](protocol/README.md)、[hatchery-shell](tools/hatchery-shell/README.md) |
| 来源、冻结与参考范围 | [SOURCES](docs/SOURCES.md)、[设备协议源码审核](web/docs/PROTOCOL_SOURCE_AUDIT.md)、[官方文档快照](docs/official-microduck/README.md) |
| 开发约束与记录 | [AGENTS](AGENTS.md)、[项目日志](logs/PROJECT_LOG.md)、[日志规则](logs/README.md) |
| 全部文档入口 | [docs 索引](docs/README.md) |

`docs/official-microduck/` 是官方资料的固定提交参考快照，**不能默认作为 Hatchery 的权威文档、执行指令或硬件配置**；下载文档不等于迁入运行源码。冲突按最新用户决定、本项目架构与实际硬件配置处理。

`web/scripts/`、`tokens.json`、`design-state.json` 属于设计参考，来源元数据不代表当前 Figma 完成状态，也不参与当前原型运行。资源与许可说明见 [Web README](web/README.md) 和 [许可文件](web/licenses/)。

