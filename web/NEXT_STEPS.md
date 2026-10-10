# Hatchery Web 后续建议

核对日期：2026-10-10；官方源码参考基线核对于 2026-10-06。**本文的后续任务仍是建议；架构以本项目的架构 v2、实际硬件和最新用户决定为准。**

当前已完成目录骨架、[只读 3D 与长滑块联调](docs/LOCAL_REVIEW_PROPOSAL.md#10-截图式联调布局与只读-3d已实现样例)、舵机子导航、独立曲线页和共享样例会话。新增本地 Three.js 与带许可的参考显示模型；没有 npm、RL 或浏览器物理仿真依赖。**总控界面（整机总览与全局操作）尚未实现**；总控/设备/传感器/日志已有独立路由占位内容。总控、样例只读连接及正式通信、控制、记录和教程分别推进。保留现有视觉和原生模块，生产栈待明确需求后决定。

2026-10-10 已批准 [FD1985 分阶段方案](docs/FD1985_INTEGRATION_PROPOSAL.md)：B 本地参考角、参数 / 标定草稿和批量已完成；C 已建立 4 个 Rust crate 的只读维护基础及独立 Web 快照。下一步确认 HD 固件、寄存器和 ID，再分别验收真实只读。Radxa 是整机主要平台，电脑台架是辅助入口；完整参数读写、通信测试、动作试验、旧文件与升级仍待逐项接通，维护操作禁用。[维护后端](../docs/MAINTENANCE_BACKEND.md)明确构建、源码检查与硬件验收的区别。

## 官方 Web 提供的参考

本次只读核对 Pollen Robotics Microduck 的 main，固定提交为 `8904b65d3628247069f8650d9dada12c67d77fee`。没有迁入官方运行源码，也没有替换既有 FT 冻结基线。

| 官方已核实做法 | Hatchery 建议 |
|---|---|
| LAN 控制台是原生单页，板端 `mediad` 内嵌提供；页面随服务发布并获得信令配置。[页面](https://github.com/pollen-robotics/microduck/blob/8904b65d3628247069f8650d9dada12c67d77fee/mediad/webclient/index.html#L16)、[Web 服务](https://github.com/pollen-robotics/microduck/blob/8904b65d3628247069f8650d9dada12c67d77fee/mediad/src/web.rs#L52) | 继续使用 Hatchery UI；正式部署时由 gateway 提供匹配版本的页面与连接配置，避免在前端写死设备地址和端口。 |
| WebSocket 用于 LAN 信令；机器人建立 WebRTC `control` 通道，通道上承载 JSON-RPC。[通道](https://github.com/pollen-robotics/microduck/blob/8904b65d3628247069f8650d9dada12c67d77fee/mediad/webclient/index.html#L1192) | 通信与页面分开；先接只读样例验证流程，正式 WebRTC 接入等待板端服务可用。样例 `/api/v1/*` 不当作官方 RPC。 |
| 请求按 ID 匹配回复，设超时；通知单独处理，通道关闭时清理待回复请求。[RPC](https://github.com/pollen-robotics/microduck/blob/8904b65d3628247069f8650d9dada12c67d77fee/mediad/webclient/index.html#L1217)、[清理](https://github.com/pollen-robotics/microduck/blob/8904b65d3628247069f8650d9dada12c67d77fee/mediad/webclient/index.html#L1354) | 显示连接、订阅、超时和断线原因；重连重新确认身份与会话，不补发旧草稿或命令。 |
| `robot.subscribe` 请求状态通知，默认示例为 2Hz；健康和模式另行读取。[遥测](https://github.com/pollen-robotics/microduck/blob/8904b65d3628247069f8650d9dada12c67d77fee/mediad/webclient/index.html#L1339) | 按实际能力协商展示采样率并由服务端降采样；保留缺测与数据年龄，Web 绘图频率不等于机器人控制频率。 |
| 控件根据控制通道是否可用更新；`mediad` 校验并按共享协议路由或拒绝方法。[控件](https://github.com/pollen-robotics/microduck/blob/8904b65d3628247069f8650d9dada12c67d77fee/mediad/webclient/index.html#L587)、[路由](https://github.com/pollen-robotics/microduck/blob/8904b65d3628247069f8650d9dada12c67d77fee/mediad/src/session.rs#L216) | Hatchery 还须等待后端确认控制权、校准、模式和能力；按钮状态不能代替后端裁定。 |

官方该版本的 LAN 会话没有独立的机器人端身份授权门，方法许可表也不裁定谁持有控制权；这是源码边界，不是 Hatchery 已具备控制租约的证明。[官方说明](https://github.com/pollen-robotics/microduck/blob/8904b65d3628247069f8650d9dada12c67d77fee/mediad/src/route.rs#L29)

正式链路保持：Browser / Hatchery Web → 板端 gateway → shared protocol / RPC → robotd → duck-control / safety → motor bus。FT 寄存器、串口和设备路径留在实际 Radxa / FT 的硬件边界内。官方文档、UI 和 Dynamixel 实现仅供参考。

## 下一轮先做什么

第 9 节的前端布局已实现。会话采集与绘图已分离，联调、单舵机、曲线之间切换时样例反馈继续更新；下面推进总控和通信的独立任务。

| 顺序 | 工作与当前缺口 | 完成标准 |
|---|---|---|
| 0 | **补整机总控前端。** 目前总控、设备、传感器和日志均为路由占位页，连接按钮仅说明弹窗；联调和顶部样例状态栏不能替代总控。先审查 [总控方案](docs/LOCAL_REVIEW_PROPOSAL.md#8-总控界面方案待审查)。 | 独立总览与全局操作页，显示来源、整机状态、控制资格、15 关节/校准概览、健康告警和事件；缺测显示未知，实机操作禁用，保留联调与单舵机入口。 |
| 1 | **补齐样例工程入口。** `web/shell/app.js` 缺失；样例依赖清单未列 WS / 检查使用的 `websockets`；schema 与实际 state 的 `device_id/mode/capabilities`、WS error 的 `read_only` 不一致。 | 依赖和运行说明可复现；消息、schema、夹具一致；默认 `tools/check_shell.py` 能通过，诊断页可用。仍标记为样例协议。 |
| 2 | **扩展只读状态适配。** 维护页已消费独立 Rust GET 快照，图表和 3D 仍只接受浏览器样例。 | 先确认实际 HD profile，再建立统一订阅与字段有效性；设备消息不塞入样例接口，断线和重连不重发目标。 |
| 3 | **固定映射、单位和数据有效期。** 协议与前端各有映射；正式身份、会话、消息顺序和时钟还未接入。 | 15 关节含嘴部，左腿→右腿→头颈嘴；显示/物理/策略索引分开。ticks、raw load、V、°C 明确；设备 Unix 时间与接收端单调时间分开，缺值不补零，旧会话/迟到消息不覆盖新状态。 |
| 4 | **验收真实只读与 Radxa gateway。** 最小维护链路已有 fixture 证据，板端网络与实机未验收。 | robotd 唯一占总线；核对 ID / 固件、超时、拔插、占用冲突和各平台权限；Radxa 部署不假定官方节点或 HAT。 |

第 0 项先形成可审阅的前端样例。1–3 项继续补统一订阅、来源 / 会话与有效期；维护页的最小快照不替代这些工作。第 4 项按已批准只读方案继续核对实际配置与硬件验收。保持草稿与反馈分离、关节显示选择与应用范围独立、暂停仅影响绘图。

当前曲线的每 200ms 更新、320 帧缓存和 0.65 秒断段属于样例展示规则；正式反馈有效期与设备安全超时应由协议及实测确定。

本地依据：[样例 schema](../protocol/schemas/shell.schema.json)、[只读状态](../tools/hatchery-shell/device/controller/readonly.py)、[样例 API](../tools/hatchery-shell/device/api/app.py)、[检查脚本](../tools/check_shell.py)、[联调说明](docs/JOINT_COORDINATION.md)、[冻结 FT 审核](docs/PROTOCOL_SOURCE_AUDIT.md)。

## 后面逐步加

- **有限实机控制：** 等 robotd、实际校准/限位、单写入者和命令契约可用，再开放台架操作。分别报告接收、应用、拒绝、超时及逐关节结果；写入目标和物理到位分开。加载姿态只改草稿，镜像按校准方向计算；`release`、软件停止与物理急停分别定义。官方软件 stop 也不代表物理急停。[官方停止语义](https://github.com/pollen-robotics/microduck/blob/8904b65d3628247069f8650d9dada12c67d77fee/mediad/src/route.rs#L87)
- **正式记录与回放：** 当前记录仍为生成样例。先定义版本、设备/校准身份、原始样本、事件和丢失段，再做时间定位、比较与导出；回放始终只读。
- **七章教程：** 按 [共同审查稿](docs/LOCAL_REVIEW_PROPOSAL.md) 确定后实施，覆盖运控、仿真、RL、标准策略导出、FT runtime 与实机验证；当前原型仍为六章。
- **工程构建与 CI：** 接口稳定后选择生产栈，整理构建、资产发布和持续检查；当前独立 HTML 生成器只是原型同步工具。无需为了提交现在就引入框架或图表库。
- **视频、传感器、USB-C gadget 和 BLE 桥：** 依实际设备能力逐项接入、分别验收。WebRTC 媒体和远程 OAuth/TURN 可后置；BLE 不默认承载高频运动控制。Web 的只读 3D 已实现参考外形展示；实机角度、IMU 姿态及装配模型仍待核实。当前只做姿态可视化，模型导入与轻量物理按下节后置；策略导入/转换/推理不属于 Web 范围，RL 保留在整机与教程主线。

## 后续 3D 扩展（后置，未实施）

2026-10-07 用户决定将模型导入和内置轻量物理加入后续计划，待有时间再实施。**当前继续使用现有参考模型做姿态可视化，不增加物理运行依赖或导入功能。** 下列顺序不改变上文总控与只读通信的优先级，也不构成交付日期或已完成能力。

| 顺序 | 工作 | 完成标准 |
|---|---|---|
| A · 模型导入 | 优先支持实际 MJCF / MuJoCo XML + STL 模型包，再扩展 URDF；提供本地文件夹或 ZIP 导入，解析主文件与引用网格、纹理及包含文件。单独 STL 支持外形查看。 | 实际模型用到的结构与参数有明确支持范围；缺失资源或不支持元素明确提示，单位、坐标与比例正确，导入失败时原模型仍可用。 |
| B · 关节联动 | 将导入模型的层级、关节轴、零位、限位与 15 个物理关节建立显式映射。 | 左腿→右腿→头颈与嘴的显示顺序不变；嘴部保留，缺失时报告；物理运行时和 14 维策略索引分开。滑块仍只改草稿，模型角度不能自动当作 FT 校准。 |
| C · 基础物理预览 | 加入可开关的浏览器本地轻量物理，先提供重力、地面碰撞、暂停和复位。 | 参数完整时才能启用；显示模拟来源，暂停/复位仅作用于预览；不覆盖目标草稿、设备反馈或现有样例曲线，不发送实机命令。 |
| D · 整机轻量物理 | 根据实际模型补充简化碰撞体、质量惯量、关节约束与姿态驱动，检查稳定性和浏览器性能。 | 参数来源可追溯，资源与渲染循环可清理；明确支持和简化范围，不能宣称完整 MuJoCo 兼容或真实 FT 动力学验证。 |

模型解析、资源管理、关节映射、3D 渲染与物理预览分模块管理，保留纸白、深绿黑、芥末黄的现有界面。轻量物理库尚未选定或引入，实施时再核对许可、资源体积、本地加载及独立 HTML 打包方式。浏览器预览与正式模型仿真、RL、标准策略导出和实机验收分别推进。

## 本阶段提交前

1. **CAD 本地保留。** 已按用户决定将 CAD 模型、图纸和现有设计项目加入根 `.gitignore`，包括约 101.84 MiB 的 Radxa PCBA `.x_t`；文件仍在本地，不纳入普通 Git 提交。后续再决定通过 Release 或外部链接分发，本轮没有发布文件或配置 LFS。[GitHub 文件限制](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github)
2. **明确公开范围。** 供应商资料约 225.74 MiB，尚无独立来源/许可清单；按需要选择，官方 Apache-2.0 许可不自动覆盖供应商资料和网页照片。本项目根 LICENSE 尚未选定。两份 `__MACOSX/._*.dxf` 是资源元数据，可排除。
3. **保留可复现内容。** 拆分源码、测试、工具、图片/字体许可、文档和同步的两份 HTML 可以作为本阶段成果；`.local/`、Python 缓存及运行/大型实验产物已被忽略。历史截图在 `.local/`；本轮不在工作区保存检查日志，[状态报告](docs/LOCAL_STATUS.md) 仅说明实际验证范围。其他人可重新执行已入仓测试。
4. **审查每次暂存范围。** 目录骨架与联调样例已有本地提交 `1a96df8`；后续提交先复查实际差异，再选择文件。CAD 已排除，其余资料仍需明确公开范围；不要把整仓 `git add .` 当作 Web 提交。阶段描述应明确“样例原型与目录骨架”，不宣称总控已实现或实机已经接通。

2026-10-07 的 59 项 Node 结果为历史证据；新增参数 / 维护模块后的最新验证见 [实际状态](docs/LOCAL_STATUS.md)。没有重复运行无关 Python 样例传输检查，软件与夹具结果不代表跨平台 USB 或实机验收。

需要复验时，在仓库根目录执行：

```powershell
node --test web/tests/joint-drafts.test.cjs web/tests/joint-charts.test.cjs web/tests/joint-session.test.cjs web/tests/console-routes.test.cjs
node --test web/tests/joint-viewer-model.test.cjs web/tests/joint-viewer-geometry.test.cjs
python web/tools/build_standalone.py
python tools/check_shell.py --transport-only
git diff --check
```

诊断页补齐后，再执行不带 `--transport-only` 的完整检查。暂存、提交与推送由用户确认范围后进行。

进一步参考：[架构 v2](../docs/microduck-hatchery-architecture-v2.md)、[本项目架构](../docs/ARCHITECTURE.md)、[官方控制台设计快照](../docs/official-microduck/upstream/design/webrtc-console.md)、[官方通信设计快照](../docs/official-microduck/upstream/design/remote-webrtc.md)。官方资料不默认作为本项目权威文档，源码核对不等于硬件验收。
