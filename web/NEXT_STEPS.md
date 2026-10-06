# Hatchery Web 后续建议

核对日期：2026-10-06。**本文是建议，尚未实施；架构仍以本项目的架构 v2、实际硬件和最新用户决定为准。**

当前可以提交“目录骨架与 Web 样例原型”这一阶段。提交前先确定大文件范围；后续优先完成可复现的只读连接，再推进控制、记录和教程。保留现有视觉和原生模块，生产栈待明确需求后决定。

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

| 顺序 | 工作与当前缺口 | 完成标准 |
|---|---|---|
| 1 | **补齐样例工程入口。** `web/shell/app.js` 缺失；样例依赖清单未列 WS / 检查使用的 `websockets`；schema 与实际 state 的 `device_id/mode/capabilities`、WS error 的 `read_only` 不一致。 | 依赖和运行说明可复现；消息、schema、夹具一致；默认 `tools/check_shell.py` 能通过，诊断页可用。仍标记为样例协议。 |
| 2 | **建立只读连接与状态适配。** 当前原型没有消费 HTTP/WS；图表只接受浏览器 sample 帧，不能直接把设备消息塞入样例接口。 | 明确区分浏览器样例、Python 夹具和未来 gateway 状态；先同源接样例服务，验证订阅、错误、超时、断线和重新订阅。没有控制请求。 |
| 3 | **固定映射、单位和数据有效期。** 协议与前端各有映射；正式身份、会话、消息顺序和时钟还未接入。 | 15 关节含嘴部，左腿→右腿→头颈嘴；显示/物理/策略索引分开。ticks、raw load、V、°C 明确；设备 Unix 时间与接收端单调时间分开，缺值不补零，旧会话/迟到消息不覆盖新状态。 |
| 4 | **实现正式只读 gateway 链路。** 设备模块目前只有说明文件。 | 经授权核对并复用 FT 代码，由 robotd 提供状态；校准模式与 robotd 的总线读写均互斥。确认实际 Radxa 配置，不假定串口、I2C、相机节点或完整 HAT。 |

先将 1–3 项做成样例只读闭环：页面连上 → 识别数据来源/会话 → 收到完整状态 → 缺测与断线明确显示。第 4 项待设备源码引入获授权、实际配置确认后推进。保持草稿与反馈分离、关节显示选择与应用范围独立、暂停仅影响绘图。

当前曲线的每 200ms 更新、320 帧缓存和 0.65 秒断段属于样例展示规则；正式反馈有效期与设备安全超时应由协议及实测确定。

本地依据：[样例 schema](../protocol/schemas/shell.schema.json)、[只读状态](../tools/hatchery-shell/device/controller/readonly.py)、[样例 API](../tools/hatchery-shell/device/api/app.py)、[检查脚本](../tools/check_shell.py)、[联调说明](docs/JOINT_COORDINATION.md)、[冻结 FT 审核](docs/PROTOCOL_SOURCE_AUDIT.md)。

## 后面逐步加

- **有限实机控制：** 等 robotd、实际校准/限位、单写入者和命令契约可用，再开放台架操作。分别报告接收、应用、拒绝、超时及逐关节结果；写入目标和物理到位分开。加载姿态只改草稿，镜像按校准方向计算；`release`、软件停止与物理急停分别定义。官方软件 stop 也不代表物理急停。[官方停止语义](https://github.com/pollen-robotics/microduck/blob/8904b65d3628247069f8650d9dada12c67d77fee/mediad/src/route.rs#L87)
- **正式记录与回放：** 当前记录仍为生成样例。先定义版本、设备/校准身份、原始样本、事件和丢失段，再做时间定位、比较与导出；回放始终只读。
- **七章教程：** 按 [共同审查稿](docs/LOCAL_REVIEW_PROPOSAL.md) 确定后实施，覆盖运控、仿真、RL、标准策略导出、FT runtime 与实机验证；当前原型仍为六章。
- **工程构建与 CI：** 接口稳定后选择生产栈，整理构建、资产发布和持续检查；当前独立 HTML 生成器只是原型同步工具。无需为了提交现在就引入框架或图表库。
- **视频、传感器、USB-C gadget 和 BLE 桥：** 依实际设备能力逐项接入、分别验收。WebRTC 媒体和远程 OAuth/TURN 可后置；BLE 不默认承载高频运动控制。Web 不加入 3D、浏览器仿真或策略导入/转换/推理，RL 保留在整机与教程主线。

## 本阶段提交前

1. **CAD 本地保留。** 已按用户决定将 CAD 模型、图纸和现有设计项目加入根 `.gitignore`，包括约 101.84 MiB 的 Radxa PCBA `.x_t`；文件仍在本地，不纳入普通 Git 提交。后续再决定通过 Release 或外部链接分发，本轮没有发布文件或配置 LFS。[GitHub 文件限制](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github)
2. **明确公开范围。** 供应商资料约 225.74 MiB，尚无独立来源/许可清单；按需要选择，官方 Apache-2.0 许可不自动覆盖供应商资料和网页照片。本项目根 LICENSE 尚未选定。两份 `__MACOSX/._*.dxf` 是资源元数据，可排除。
3. **保留可复现内容。** 拆分源码、测试、工具、图片/字体许可、文档和同步的两份 HTML 可以作为本阶段成果；`.local/`、Python 缓存及运行/大型实验产物已被忽略。当前测试报告和截图在 `.local/`，只会留在本机；[状态报告](docs/LOCAL_STATUS.md) 保存验证范围，其他人可重新执行已入仓测试。
4. **审查本次暂存范围。** 当前只有 `web/README.md` 已跟踪，大部分工作区文件尚未跟踪，暂存区为空。CAD 已排除，其余资料仍需明确公开范围，再显式选择文件；不要把整仓 `git add .` 当作 Web 提交。阶段描述应明确“样例原型与目录骨架”，不宣称实机已经接通。

已有验证：模型 22 项、曲线 10 项、完整联调浏览器 56 项、随后紧凑选择区 13 项，以及只读样例传输检查。它们是本机样例验证，不是诊断页完整检查、正式通信、跨平台或实机验收；本轮仅审阅源码和写建议，没有重新运行这些测试。

需要复验时，在仓库根目录执行：

```powershell
node --test web/tests/joint-drafts.test.cjs web/tests/joint-charts.test.cjs
python web/tools/build_standalone.py
python tools/check_shell.py --transport-only
git diff --check
```

诊断页补齐后，再执行不带 `--transport-only` 的完整检查。暂存、提交与推送由用户确认范围后进行。

进一步参考：[架构 v2](../docs/microduck-hatchery-architecture-v2.md)、[本项目架构](../docs/ARCHITECTURE.md)、[官方控制台设计快照](../docs/official-microduck/upstream/design/webrtc-console.md)、[官方通信设计快照](../docs/official-microduck/upstream/design/remote-webrtc.md)。官方资料不默认作为本项目权威文档，源码核对不等于硬件验收。
