# Microduck Hatchery 共享协议

`protocol/` 是仓库根目录的前后端共享契约模块，独立于 `web/` 和设备驱动。当前已有本地样例壳的 `hatchery-shell/0` 草案、标准 15 关节映射及缺测夹具；这不是生产协议冻结，也不是上游 servo-web 或 robotd 的原有协议。

协议定义数据如何表达，**正式执行资格和真实状态由 `src/` 的 robotd / duck-control 裁定**。当前已建立最小只读维护子集，完整整机资格与写入仍未实现；前端不能通过修改共享文件、UI 排序或缓存使设备接受未验证目标。

按 [架构 v2](../docs/microduck-hatchery-architecture-v2.md) 保留 [duck-ipc-proto/](duck-ipc-proto/README.md) 和 [duck-ble/](duck-ble/README.md)。前者已有独立 `hatchery-maintenance/1` Rust 只读契约，后者仍为说明位置；完整官方协议未迁入。下列 JSON 是旧样例工具的辅助文件，不是维护 RPC 的消息格式。接口与边界见 [维护后端](../docs/MAINTENANCE_BACKEND.md)。

## 当前文件

这些 JSON 由 [tools/hatchery-shell/](../tools/hatchery-shell/README.md) 只读样例服务消费，不依赖浏览器业务代码或新增第三方校验库：

| 目标目录 | 内容 |
|---|---|
| [`schemas/shell.schema.json`](schemas/shell.schema.json) | JSON Schema Draft 2020-12 草案；定义 info、state、扁平 hello、只读拒绝、映射与样例夹具。只描述样例壳，不包含可执行控制命令。 |
| [`mappings/joints.json`](mappings/joints.json) | 15 个关节的身份与三个独立索引；数组按显示顺序排列。IMU #200 独立列出。 |
| [`fixtures/sample-state.json`](fixtures/sample-state.json) | 全部 15 行；只有 left_knee #23 包含明确的样例数值，其余 14 行为 `missing` 且数值为 `null`。 |

索引从 0 开始。显示索引是左腿 → 右腿 → 头颈嘴；运行时索引是左腿 → 头颈嘴 → 右腿；策略索引没有 mouth #34，因而该项为 `null`。该映射来自 [交接 §7](../Microduck-Hatchery-Local-Development-Handoff.md#7-15-个关节完整映射与显示规则)，仍须用真实设备与所选策略核对，不能被当作校准文件。

样例夹具中 #23 的 `position_ticks=120`、`goal_ticks=128`、`load_raw=12`、`voltage_v=7.8`、`temperature_c=31` 仅用于验证数据链路；不表示在线、不表示某台机器已测量，也不提供可执行目标。没有角度、零位、机械限位或 HOME 数据。

## 壳协议 `hatchery-shell/0`

- `GET /api/v1/info` 返回 `sample=true`、`fake=true`、`simulated=false`、`source="sample"`、`device_id=null`、后端生成的 `session_id`、`read_only=true` 与 `mode="sample_read_only"`。`capabilities.telemetry=true`；control、calibration、recording、runtime 均为 false。`joint_mapping` 是后端读取的完整映射，前端据此展示关节。
- `GET /api/v1/state` 与 WS state 含完整 15 行，以及 `sequence`、`sampled_at_unix_s`、`monotonic_elapsed_s`、`age_ms`。Unix 时间是样例状态生成时间；单调时间是本次后端会话的经过时间，两者不能混用，更不能声称是实机采样时间。
- WS hello 是 `{type: "hello", ...info}` 的扁平对象。壳不处理客户端控制指令，客户端发来的消息仅触发只读拒绝；拒绝 `command_id` 与 `operation` 为 null，不返回伪造命令确认。
- HTTP 写请求返回 403 和 `error.code="read_only"`；WS 返回 `type="error"`、`code="read_only"`。拒绝只能表示服务禁止控制，不能解释成硬件急停或已释放总线。

服务启动时检查映射唯一性、三个索引和夹具覆盖；JSON Schema 文件本身不替代这些跨字段检查。不安装 JSON Schema 校验器，也不声明生产模式、租约、控制确认、断线策略、IMU 或正式记录已经实现。真实接入需要另行审查版本、字段与能力。

已知草案缺口：现有 state schema 未涵盖实际样例响应的 device_id / mode / capabilities，WS error 的 read_only 字段也未对齐；本轮保持 JSON 原样，不宣称消息已通过完整 schema 校验。

尚未加入来源未知、陈旧、断线、重连、部分控制结果与正式记录夹具；当前仅验证样例链路和拒绝路径。其他消息随对应设备能力落实后加入，不合成上游不存在的字段。

## 必须保持的语义

- 全部 15 个物理关节始终存在，包括 mouth #34。显示为左腿→右腿→头颈嘴；运行时物理顺序和 14 维策略索引分别维护。IMU #200 为独立传感器。
- 缺 key 与 null 都表示缺测，不能补零或删掉关节行。目标草稿、实测状态和执行结果分别表达。
- FT 原始位置保留 ticks、负载保留 raw load；真实角度转换必须有已核对的校准版本、方向和单位。设备端再次校验范围与对称联动结果。
- 冻结 servo-web 的 `state.t` 为 Unix 秒；官方 robotd 的单调时间不能直接改名混用。状态携带来源、会话和有效期，浏览器接收时间不替代采样时间。
- 真实/fake/sim 与 IMU 来源显式表达，未知不猜测为真实。身份/会话/能力等新增字段是待设计契约。
- 命令接收、应用/读回、到位分别定义；结果由设备端产生，批量包含逐关节状态。加载姿态与编辑草稿不产生执行命令。
- 正式记录区分元信息、状态样本和事件；回放只读，不重新发送历史目标。

## 复用来源

先以 [冻结 FT 源码审核](../web/docs/PROTOCOL_SOURCE_AUDIT.md) 作为事实依据，再设计适配契约；不把设计字段描述成上游现有接口。完整 FT robotd 的协议仍需按固定版本核对。

前端和设备 API 可消费共享契约，协议模块不依赖前端、串口驱动、仿真/RL 或推理库。真实设备配置、校准和控制租约不由前端持有。

阶段条件见 [PLAN.md](../docs/PLAN.md)，权威后端边界见 [src/README.md](../src/README.md)。
