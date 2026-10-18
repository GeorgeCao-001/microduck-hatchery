# 本轮官方升级基线与保护边界

日期：2026-10-18。任务与状态以 [执行计划](OFFICIAL_MIGRATION_EXECUTION.md) 为主表；本文件保存 M0 的事实依据。[保护清单](MIGRATION_BASELINE.json) 保存升级前文件哈希。

开始执行时，`dev` 工作区干净，HEAD 为 `6b8a110bb7f138178f4122b3fd75d18b5c6cff51`。RKAIQ 高级控制已包含在该提交中，并非待保留的未提交工作。

## 固定版本与用户决定

| 项目 | 固定版本 | 处理 |
|---|---|---|
| 原官方源码 | `9136aa4ee88e81edf2bcaf3527e90b65da25f1eb`，0.15.1 / API 37 | 保留 robotd、duck-control 的 FT 行为基线 |
| 非舵机升级 | `53230463927095ea890f231d29089bb0a538c06f`，0.17.6 / API 44 | 228 个提交、203 个变更文件的候选差异经用户选择后迁入，不追踪移动 main |
| 候选根树 | `c322ea108f02dd937633b7169a8d25eee80181ac` | 官方固定源码归档及逐文件哈希 |
| microduck_rl | `b02fdea4902c2b93b7d34a83a6f05da4ececb7d3` | 独立训练仓库，原样迁入 training/microduck_rl，未安装依赖或运行 |
| duck_detector 训练仓库 | `cc1b52eb3ace9643c8948320e63f46a85cf6fb65` | 原样迁入 training/duck_detector，未下载模型或数据集 |

用户决定：升级舵机以外的代码；FT 驱动、寄存器、读写、动作、标定与舵机配置保持不动。随后明确允许 robotd 为新版协议补充必要的默认字段。只读系统服务观察不改变舵机逻辑。

`robotd` 仍使用旧控制实现。API 44 是共享协议版本，不表示旧后端实现了所有新版方法。新增的 picked-up、servo / IMU census 以兼容默认值表示旧后端未提供；未迁入新版休眠、拾起检测或 vetbook 控制行为。原策略 pin `v5` 和串口库 `4.10.1` 保留。

## 模块处理矩阵

| 官方根模块 | 本地位置 | 决定与当前限制 |
|---|---|---|
| robotd | src/daemons/robotd | 保留；仅协议默认字段及只读服务列表变化 |
| duck-control | src/libraries/duck-control | 整个 crate 保持升级前文件内容 |
| mediad、configd | src/daemons/同名目录 | 升级；保留 Hatchery Web、实时相机参数、RKAIQ、NM / BlueZ 扩展、维护 binary |
| updater、btd、padd、tof、netpadd、nfc | src/daemons/同名目录 | 完整源码迁入；按实际外设选择构建与运行，不自动安装或启用 |
| robotd-params | src/libraries/robotd-params | 升级非舵机类型；Mode 至 ParamsError 前的原策略、安全、总线、控制、更新门控配置段完整保留 |
| kinematics、odometry、sounds、pet-detect、duck-detect、pad-imu、pad-map、uyvy | src/libraries/同名目录 | 对齐固定上游；未改关节映射与 FT 单位 |
| duck-ipc-proto、duck-ble | protocol/同名目录 | API 44 和 BLE 契约；保留维护与连接扩展 |
| robotctl、duckctl、duck-ether、xtask、test-support | tools/同名目录 | 保留完整 crate；显式指向 src workspace；打包与部分脚本查根仍需适配 |
| spaces | spaces/ | hello、policy-playground、vision-demo、vetbook、shared 源码迁入；没有发布远程应用 |
| hooks、scripts、deploy、.github | 根目录原名 | 新文件迁入，既有文件保留；安装链与 CI 尚未验收，不直接执行原版 provision / install / OTA |
| docs、README、CONTRIBUTING、上游代理指令 | 官方缓存 / 固定链接 | 保留本项目文档与指令；按需要引用，不覆盖本项目权威 |
| 上游 .cargo | src/.cargo/config.toml | 官方 board alias 随 src workspace 保留，从 src 内使用；交叉发布链尚未验收 |

workspace 从 13 增至 26 成员，默认仍只选择 robotd / mediad，避免默认编译全部桌面工具。新功能的依赖来自相应官方 Cargo.toml：BLE 使用 bluer / vendored D-Bus，手柄使用 gilrs / evdev / pad-map，ToF 使用 ST ULD 及上游锁定的 BMI088 依赖，更新使用官方签名、下载和归档库。它们不会因为迁入而自动访问硬件。

## 本机硬件事实与待核对项

| 能力 | 已知依据 | 未确认 / 限制 |
|---|---|---|
| 板卡 / 系统 | 用户提供 Radxa Zero 3W；Armbian Debian trixie arm64；内核 `6.1.115-vendor-rk35xx` | 本轮无 SSH 登录或板端测试 |
| 网络 | 用户曾通过 USB gadget 及 Wi-Fi 登录，Windows Clash 代理 | 当前接口名、IP、校园网认证能力需板端确认；不固定到代码 |
| 相机 / ISP | Radxa Camera8M219 / IMX219；用户回传 video0 rkisp、mpph264enc、活动的 rkaiq_3A_server，socket `/tmp/UNIX.domain0` | 实际采集格式、标定、最新流式显示与参数效果仍需用户验收 |
| 舵机 | HD-1910-C001、FE-URT2；历史 Windows 单颗 ID 1 / 1 Mbps 调试 | 不把历史连通当作装机映射、角度标定或动作验收 |
| 身体 IMU | 硬件选型为裸 LSM6DSV16X 模块；官方实现依赖 imu_to_dxl 转接板 | 用户决定暂缓；不新增 I²C 适配，不改冻结控制模块 |
| ToF | 硬件资料包含 VL53L5CX；新官方 tofd 同时含 L5 / L8 ULD | 实物型号、I²C / GPIO 接法待确认；不能使用 beta 默认接法代替 |
| 头部 IMU | 新 tofd 含 BMI088 支持 | 未选该外设，不默认启用 |
| 音频 / NFC / 手柄 | 官方软件模块现已迁入 | 未确认硬件，保持可选；服务进程存在不表示对应硬件就绪 |

## 保留与验证

冻结清单涵盖 95 个文件，另保存 robotd-params 舵机配置段的 LF 文本哈希。例外逐项写在 JSON 中；它们不包含 FT 驱动、动作、校准或生效的总线配置。用户要求的只读 Web 显示有单独例外：曲线和 3D 按后端关节名称使用 rad，保留原始保护哈希，不改 ticks 草稿或装机标定。来源清单逐文件区分旧、新官方版本及 Hatchery 修改。

Windows 两个 maintenance binary 已构建通过。26 个 workspace 成员及其测试目标的 ARM64 类型检查已通过，显式开启三个 board-runtime feature；使用 `DOCS_RS=1` 跳过 GStreamer 原生库探测，不能算作 Radxa 链接或运行验证。旧 robotd-maintenance 的 soc.rs 未使用函数警告仍存在，未通过删除保留代码来消除。

新增服务、工具、Web 与安装链的结果继续写入执行计划；未通过项不记作完成。板端测试由用户执行。
