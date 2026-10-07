# Microduck Hatchery 设备协议源码审核

状态：**2026-10-05 本次源码审核；无实机测试。**

本文保留冻结源码的审核证据，尚未实现的适配建议不作为现行设备架构。正式控制边界以 [架构 v2](../../docs/microduck-hatchery-architecture-v2.md) 和 [当前架构](../../docs/ARCHITECTURE.md) 为准：gateway → shared protocol / RPC → robotd → duck-control / safety；不让 Web 或独立 servo-web 成为第二个权威控制器。

本次完整阅读本地开发交接文档与 `SOURCE_FREEZE.md`，直接读取下列冻结 GitHub 源码，再核对协议字段和控制行为。未启动设备服务、连接串口或机器人、发送设备命令、安装依赖，也未修改上游仓库。以下结论属于本次源码审核，不是 George 团队的设备、性能、训练或跨平台验收结果。

## 审核基线与可追溯文件

仓库：[fanhao375/microduck-replica](https://github.com/fanhao375/microduck-replica/tree/b5381d86b68d2e4f4606170d54d1f3f46d249ffc)。冻结提交：`b5381d86b68d2e4f4606170d54d1f3f46d249ffc`。

| 文件 | 本次读取的 Git blob SHA |
|---|---|
| [tools/servo-web/server.py](https://github.com/fanhao375/microduck-replica/blob/b5381d86b68d2e4f4606170d54d1f3f46d249ffc/tools/servo-web/server.py) | `2b8a88c218121016e440673a7b7fd5eb063c7773` |
| [tools/servo-web/feetech.py](https://github.com/fanhao375/microduck-replica/blob/b5381d86b68d2e4f4606170d54d1f3f46d249ffc/tools/servo-web/feetech.py) | `f89eee17613b2449293d0c4816db127c97b08d56` |
| [tools/servo-web/requirements.txt](https://github.com/fanhao375/microduck-replica/blob/b5381d86b68d2e4f4606170d54d1f3f46d249ffc/tools/servo-web/requirements.txt) | `e51b393dba0a239e9413c9571e1a88c446fcb4b1` |

本次仅审核上述三份源码，不宣称已经核对完整 FT runtime、IMU 读取器、BLE 服务或真实设备固件。

## 已核实事实：运行与读取接口

源码声明服务版本 `0.15.4`，默认监听 `0.0.0.0:8080`，波特率默认 `1_000_000`。默认 ID 顺序为 `20–24,30–34,10–14`，对应左腿、头颈嘴、右腿；此服务顺序与 Hatchery 的左腿、右腿、头颈显示顺序应分别维护。[版本与映射](https://github.com/fanhao375/microduck-replica/blob/b5381d86b68d2e4f4606170d54d1f3f46d249ffc/tools/servo-web/server.py#L37)，[启动参数](https://github.com/fanhao375/microduck-replica/blob/b5381d86b68d2e4f4606170d54d1f3f46d249ffc/tools/servo-web/server.py#L1533)

依赖声明是 `starlette>=0.37`、`uvicorn[standard]>=0.29`、`pyserial>=3.5` 和 `numpy>=1.24`；numpy 注明仅供 `build_model.py` 使用。这些是最低版本要求，不是精确依赖锁定，也不构成 Web 前端引入 numpy 或 3D 运行依赖的依据。[requirements.txt](https://github.com/fanhao375/microduck-replica/blob/b5381d86b68d2e4f4606170d54d1f3f46d249ffc/tools/servo-web/requirements.txt#L1)

| 入口或消息 | 已核实行为 | 尚缺或需要注意 |
|---|---|---|
| GET `/` | 返回上游 `index.html`，禁用缓存 | 不是当前 Hatchery 原型；上游 3D 页面无需随协议迁移 |
| GET `/imu_attitude.js` | 返回上游 IMU 页面脚本 | 本次未审核其实现 |
| GET `/model/{name}` | 只允许 `model.json`、`meshes.bin`，不存在时返回 404 | 属于上游模型展示资源；2026-10-07 Hatchery 将参考显示资源单独用于静态只读 3D，不依赖此设备服务路由，也不据此接入控制 |
| GET `/api/info` | 返回 `version/ids/present/names/fake/stats/log`，日志最近 50 条 | 没有唯一设备身份、协议版本、会话 ID 或完整能力表 |
| GET `/api/poses` | 返回姿态列表中的 `file/name/time/note/goals/steps` | 没有完整的校准版本、单位、设备身份和映射兼容契约 |
| GET `/api/logfile` | 下载当天文本日志；没有日志时返回 404 | 不等于 Hatchery 正式实验记录格式 |
| WS `/ws` → `hello` | `ids/present/names/fake/logs/cats/dirs/port/ports/regs/version/imu_enabled/sim_imu` | 串口路径不能充当唯一设备身份 |
| WS → `state` | `type/t/states/stats` | 需要另定义数据有效期、会话和记录时间契约 |

依据：[完整路由表](https://github.com/fanhao375/microduck-replica/blob/b5381d86b68d2e4f4606170d54d1f3f46d249ffc/tools/servo-web/server.py#L1522)、[页面与静态资源](https://github.com/fanhao375/microduck-replica/blob/b5381d86b68d2e4f4606170d54d1f3f46d249ffc/tools/servo-web/server.py#L380)、[HTTP API](https://github.com/fanhao375/microduck-replica/blob/b5381d86b68d2e4f4606170d54d1f3f46d249ffc/tools/servo-web/server.py#L936)、[hello](https://github.com/fanhao375/microduck-replica/blob/b5381d86b68d2e4f4606170d54d1f3f46d249ffc/tools/servo-web/server.py#L1366)。

### 关节缺测与时间

- `state.t` 在总线读取结束后由 `time.time()` 生成，单位为 Unix 秒；不是单调时间，也不是每个关节的精确采样时刻。
- 常规状态流读取 `PRESENT`。初次扫描未发现的关节可能没有对应 key；进入读取范围但本次未得到反馈的关节可为 `null`。Hatchery 必须同时处理缺 key 和 null，以标准映射固定显示全部 15 个物理关节，再按 ID 合并反馈，嘴部不能省略，未知值不能填 0。
- 实串口 `STREAM_HZ=50`、FakeBus `FAKE_STREAM_HZ=30` 是调度配置值，不证明实际稳定采样率，更不证明 IMU、推理与写入组成的完整闭环频率。
- 统计项包括 `tx/rx_ok/timeout/bad_checksum/bad_id`。计数语义来自总线实现，不能直接当作关节样本数或稳定控制率。

依据：[轮询与状态流](https://github.com/fanhao375/microduck-replica/blob/b5381d86b68d2e4f4606170d54d1f3f46d249ffc/tools/servo-web/server.py#L1313)、[频率配置](https://github.com/fanhao375/microduck-replica/blob/b5381d86b68d2e4f4606170d54d1f3f46d249ffc/tools/servo-web/server.py#L250)、[总线计数与包解析](https://github.com/fanhao375/microduck-replica/blob/b5381d86b68d2e4f4606170d54d1f3f46d249ffc/tools/servo-web/feetech.py#L72)。

### 单位和原始值

| 字段 | 冻结源码解析 | Hatchery 使用边界 |
|---|---|---|
| `pos/goal` | BIT15 符号幅值，原始位置 ticks | 已核实设备与校准换算前显示 ticks，不标成准确角度 |
| `speed` | BIT15 符号幅值 | 物理单位还需结合实际型号、相位与固件核对 |
| `load` | BIT10 符号幅值 | 原始负载量，不标成 N·m |
| `volt` | 原始字节除以 10 | V |
| `temp` | 温度原字节 | 源码寄存器表标为 °C；具体设备适用性待核实 |
| `current_ma` | 原始电流字 sign15 后乘以 6.5 | 源码解析结果，不代表已标定电流测量 |
| `err/status/moving` | 应答错误字节、状态字节、移动字节 | 保留原码，不能只显示颜色 |
| `status_text` | 按状态位生成文本 | 作为诊断辅助，与原码一起保留 |

`feetech.py` 从地址 56 起读取 15 字节，解码位置、速度、负载、电压、温度、状态、移动标志、目标和电流。当前返回的状态 JSON **没有独立原始电流字，也没有完整原始块**。若正式记录要求保留原始数据，后续适配协议必须明确增加字段和解析版本，不能声称当前状态流已经提供。[寄存器与符号规则](https://github.com/fanhao375/microduck-replica/blob/b5381d86b68d2e4f4606170d54d1f3f46d249ffc/tools/servo-web/feetech.py#L24)、[解码与缺测](https://github.com/fanhao375/microduck-replica/blob/b5381d86b68d2e4f4606170d54d1f3f46d249ffc/tools/servo-web/feetech.py#L240)

### FakeBus 与 IMU 来源

没有给串口、显式 `--fake`，或启动时无法打开串口时，服务可以退回 FakeBus；此时 `PRESENT` 会包含模拟 ID，不代表实物在线。Hatchery 必须显式展示 `fake`，不能用关节数量或非空数据推断实机。[FakeBus 回退](https://github.com/fanhao375/microduck-replica/blob/b5381d86b68d2e4f4606170d54d1f3f46d249ffc/tools/servo-web/server.py#L323)、[启动逻辑](https://github.com/fanhao375/microduck-replica/blob/b5381d86b68d2e4f4606170d54d1f3f46d249ffc/tools/servo-web/server.py#L1610)

`sim_imu` 可为 `off/on/lost/null`。`null` 表示 IMU 并非由页面模拟开关接入，**不证明 IMU 来自实机**：启动参数 `--imu-demo` 创建演示服务，也可令 `sim_imu=null`。应结合 IMU 帧自身的模式与来源判断；当前三文件审核不足以给出完整 IMU 字段契约，需在对应阶段再审核 `imu_bridge.py` 与 `imu_bus.py`。来源不明时显示未知。[sim_imu 定义](https://github.com/fanhao375/microduck-replica/blob/b5381d86b68d2e4f4606170d54d1f3f46d249ffc/tools/servo-web/server.py#L1075)、[demo 服务](https://github.com/fanhao375/microduck-replica/blob/b5381d86b68d2e4f4606170d54d1f3f46d249ffc/tools/servo-web/server.py#L1563)、[IMU 广播](https://github.com/fanhao375/microduck-replica/blob/b5381d86b68d2e4f4606170d54d1f3f46d249ffc/tools/servo-web/server.py#L1420)

## 已核实事实：控制与生命周期缺口

| 操作 | 源码实际行为 | 不应推断的结论 |
|---|---|---|
| `goal` | 写寄存器 42，调用方忽略写入返回值，无完整独立成功回复 | 不能凭发送成功宣称设备已应用或运动完成 |
| `goals` | 对目标进行广播 `sync_write` | 没有逐舵机写入应答，也没有绝对物理同步保证 |
| `goals_verify` | **每轮先重写寄存器 42**，再读取状态中的目标；最多 4 轮，返回 `missing/attempts` | 不是只读验证，也不能证明关节已到位 |
| `goals_stream/stream_end` | 使用全局 `STREAM_LAST` 保存上一帧；结束时恢复速度设置 | 没有按客户端隔离的序列所有权或完整失联停止语义 |
| `goals_profile` | 写加速度、目标、时间与速度；立即返回 | 源码仍要求浏览器等待后调用 verify/release，设备端生命周期未完整建立 |
| `release` | 寄存器 41 写 0，46 写 `MAX_SPEED_REG`；不改目标，不关扭矩 | 不是停止、卸力或急停；原目标仍可能继续执行 |
| `torque` 使能 | 对原先关闭的关节读位置、写目标并直接读 42 核对，然后广播扭矩使能；返回 `ids/aligned/bad` | 回复不等于已逐项回读证明扭矩确实开启 |

依据：[goal、批量与流操作](https://github.com/fanhao375/microduck-replica/blob/b5381d86b68d2e4f4606170d54d1f3f46d249ffc/tools/servo-web/server.py#L1114)、[goals_verify](https://github.com/fanhao375/microduck-replica/blob/b5381d86b68d2e4f4606170d54d1f3f46d249ffc/tools/servo-web/server.py#L1172)、[release_speed](https://github.com/fanhao375/microduck-replica/blob/b5381d86b68d2e4f4606170d54d1f3f46d249ffc/tools/servo-web/server.py#L257)、[使能前对齐](https://github.com/fanhao375/microduck-replica/blob/b5381d86b68d2e4f4606170d54d1f3f46d249ffc/tools/servo-web/server.py#L996)、[广播写入实现](https://github.com/fanhao375/microduck-replica/blob/b5381d86b68d2e4f4606170d54d1f3f46d249ffc/tools/servo-web/feetech.py#L189)。

### 控制互斥与断线

- WS 直接接受各客户端的 `op`，通过线程执行 `handle()`；本次审核的服务没有鉴权、单写入者租约、请求 ID、命令去重、过期时间或完整手动/策略模式仲裁。多个客户端可以各自进入命令处理。[WS 命令处理](https://github.com/fanhao375/microduck-replica/blob/b5381d86b68d2e4f4606170d54d1f3f46d249ffc/tools/servo-web/server.py#L1366)
- 串口 `_io` 锁只保护此进程中单次总线访问；不能阻止外部 robotd，也不保证整个多步动作互斥。[总线锁](https://github.com/fanhao375/microduck-replica/blob/b5381d86b68d2e4f4606170d54d1f3f46d249ffc/tools/servo-web/feetech.py#L72)
- `CALIB_LOCK` 包住校准与撤销，并让状态轮询暂停，但普通控制分支没有统一检查此锁。因此不能宣传校准期间其他控制已被全面拒绝，更不能让校准后端与 robotd 同时写总线。[校准锁](https://github.com/fanhao375/microduck-replica/blob/b5381d86b68d2e4f4606170d54d1f3f46d249ffc/tools/servo-web/server.py#L772)、[撤销锁](https://github.com/fanhao375/microduck-replica/blob/b5381d86b68d2e4f4606170d54d1f3f46d249ffc/tools/servo-web/server.py#L847)、[轮询暂停](https://github.com/fanhao375/microduck-replica/blob/b5381d86b68d2e4f4606170d54d1f3f46d249ffc/tools/servo-web/server.py#L1313)
- WS 断线收尾仅 `CLIENTS.discard(ws)`；没有释放控制租约、清空全局 `STREAM_LAST`、更改目标、关扭矩或停止序列。[断线收尾](https://github.com/fanhao375/microduck-replica/blob/b5381d86b68d2e4f4606170d54d1f3f46d249ffc/tools/servo-web/server.py#L1392)

## 拟议 Hatchery 协议：待审查，尚未实现

以下条目是基于交接要求的协议建议，不是上游已存在的字段、路由或能力，也未在本次审核中实现。

| 契约 | 拟议内容 |
|---|---|
| 身份与版本 | 唯一设备身份、服务 SHA、协议版本、连接会话和能力；串口只作为传输信息 |
| 关节与校准 | 固定 15 物理关节映射；显示、运行时物理、策略动作顺序分开；校准版本、方向、零位、限位和镜像语义 |
| 数据来源与单位 | 实机、FakeBus、模拟 IMU、未知来源分别标明；ticks 与角度换算明确，raw load、电流原值和解析版本可追溯 |
| 时间与有效期 | Unix 设备时间与接收端单调时间分别记录；明确反馈年龄、缺测和时钟跳变；未同步时不推断单向延迟 |
| 控制权 | 同一总线单写入者；校准、手动与 robotd 策略模式互斥；多个观察客户端可以只读 |
| 命令与批量结果 | 请求 ID、期限与去重；已接收、已应用、拒绝、失败、超时；逐关节结果；目标已写入与运动到位分别报告 |
| 动作生命周期 | 设备端掌握序列时序、取消、完成与超时；明确断线行为，重连不重放旧命令、不自动使能或执行草稿 |
| 记录与回放 | 版本化元信息、样本和事件；记录丢失段与断线原因；回放只能读取历史数据，不能调用命令发送 |

### 只读候选接口与后续核对

1. 先按 v2 核对正式 gateway / RPC / robotd 的契约与已有 FT 代码；本轮没有引入官方源码或建立这条链路。冻结 servo-web 用作字段与台架功能参考，不另外制造权威控制器。
2. 在明确独占总线的单独台架/校准模式，上游只读候选为 GET `/api/info`、GET `/api/poses`、GET `/api/logfile`；WS 只被动接收 `hello/state/logs/imu/imu_config`。**只读客户端不发送任何 `op`**，`goals_verify` 不能按名字纳入只读白名单。上述路由不是当前样例 `/api/v1/*`，也不是尚未实现的正式 RPC。
3. WS 连接会触发上游总线轮询；robotd 持有总线时必须停用独立校准后端及其轮询，正式 gateway 经 robotd 读取状态。读取同样要仲裁，纯本地原型阶段不连接设备服务。
4. 根据冻结字段准备离线夹具，核对缺 key/null、完整 15 行映射、模拟来源、断线重连与时钟跳变；目标草稿和反馈保持分离，未知反馈不填零。
5. 后续获得只读接入授权与实际设备信息后，再核对对应 IMU 源码、固件和只读链路。控制功能继续禁用，直至控制权、校准限位、逐项确认和断线契约明确。

本文保留源码事实与来源，不宣布七章教程、关节联调、真实连接、正式记录或实机验收已经完成。来源版本与素材线索集中在 [SOURCE_FREEZE.md](SOURCE_FREEZE.md)。
