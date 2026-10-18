# Microduck Hatchery Web

Hatchery 的开发、调试、展示和教程前端，保持原生 HTML/CSS/JS。关节联调、只读 3D、反馈表和独立曲线仍为样例；参数与标定以关节表与详情整合扫描、实际 ID 选择及台架调节，原始回读与显式限幅控制由 Rust 后端处理。**总控界面（整机总览与全局操作）尚未实现**，生产前端栈尚未冻结。

设备 ID、固件参数和标定配置的修改入口仅位于“参数与标定”；其他调试页面只读取其关联配置，运行目标草稿可以单独编辑。当前配置为未实机确认的会话草稿；完整参数写入及固件镜像升级仍未实现。扫描在左表表头，实际 ID 与参数 / 软件标定 / 位置调节在同一右侧详情中，保留正常导航尺寸和紧凑数据行。

2026-10-10 已批准 [FD1985 分阶段接入方案](docs/FD1985_INTEGRATION_PROPOSAL.md)：15 颗 HD-1910-C001。Radxa Zero 3W 是整机主要平台，Windows / macOS 本机台架是辅助入口。B 已加入参考角、参数 / 标定草稿与批量；C 已提供独立 Rust 后端只读快照，已取得单颗真实 PING，位置、动作与装机标定尚未验收，完整 FD 功能仍分阶段验收。

2026-10-11 台架入口允许未归类 ID 独立调试，新增原始 READ、目标滑块 / 数字草稿与显式输出 / 单颗动作通道；Windows 构建和语法检查通过，未实机执行动作。启动与边界见 [维护后端](../docs/MAINTENANCE_BACKEND.md)。

## 本地运行

“设备”位于总控与舵机之间，只显示当前连接的后端主机。通过 `device-session.js` 的同源只读接口显示设备名称、系统指标、程序服务启动状态、网络接口与蓝牙枚举；`device-workspace.js/css` 管理页面和全调试台顶部状态栏。当前没有多设备入口或切换。静态原型保留未知状态，舵机 fixture 与真实系统信息分别标明；本地名称和连接方式备注只保存在浏览器，不修改板端配置。详细字段及启动方式见 [设备状态接口](../docs/MAINTENANCE_BACKEND.md#当前设备与系统状态)。

设备页使用身份卡片、连接状态、CPU / 内存仪表、温度与可切换趋势，保留纸白、深绿与芥末黄配色。点选仪表查看对应趋势，支持最近 1 / 3 分钟、悬停或方向键查看采样、暂停绘图；暂停期间系统读数与历史采集继续。断线保留并标记上次读数，缺测不补零，设备重启或身份变化重置历史。Wi-Fi / 蓝牙在连接面板选择，网络地址收在设备详情，IPv4 与 SSH 命令可复制，剪贴板不可用时提供手动复制；显示名称、连接备注与 SSH 用户名仅存本浏览器。技术字段折叠，Wi-Fi 扫描 / 切网与蓝牙配对复用官方 configd；电池与整机健康尚未接入，不由接口有地址推断公网可用。

在仓库根目录执行，无需安装第三方 Python 或 NPM 包；3D 引擎随仓库本地提供：

```powershell
python web/tools/preview.py
```

打开 <http://127.0.0.1:5173/>，用 `Ctrl+C` 停止；端口占用可加 `--port 5174`。脚本依据自身位置定位原型，仅提供 loopback 静态预览。

[单文件原型](Microduck-Hatchery-Visual-Prototype.html) 也可直接打开。已有 [Python 只读样例工具](../tools/hatchery-shell/README.md) 使用 `python scripts/hatchery-shell.py --port 8080`；诊断页 `shell/` 缺少 `app.js`，尚未完整可用。

打开 `#console` 或 `#console/servos` 默认进入联调。“舵机”下设同级子页：`#console/servos/joint` 关节联调、`#console/servos/single` 单舵机调试；曲线独立使用 `#console/charts`。2026-10-07 已按授权落实 [第 9 节布局](docs/LOCAL_REVIEW_PROPOSAL.md#9-舵机布局调整与独立曲线页已实现样例)，替代此前调节与曲线并排的布局。

新增 `#console/servos/parameters` 参数与标定，支持 15 关节紧凑表、独立批量范围、勾选字段、先预览差异再应用本地草稿，以及校验后的 JSON 导入导出。软件标定填写参考 counts / 参考姿态角 / 方向 / 机械限位，手动预览公式；完整草稿不自动生效，实机标定仍为 0/15。离页、换关节或修改草稿后需重新预览批量差异；整页刷新清空内存草稿，可先导出保存。该页同时支持 0–253 范围扫描、取消、实际 ID 选择、原值调节、寄存器回读及受后端校验的自身 ID 修改；未关联舵机使用相同参数和标定逻辑。详见 [使用说明](docs/JOINT_COORDINATION.md#参数与软件标定草稿)。

本机 Rust 后端使用 `python scripts/hatchery-maintenance.py --fixture`，需 Rust 1.99.0 与系统链接环境。打开 <http://127.0.0.1:8088/#console/servos/parameters> 可查看明确 fake 的原码夹具、逐 ID 主机接收时间与串口枚举；不加 `--fixture` 保持未连接。原联调、曲线和 3D 仍为浏览器样例。静态预览 / 单文件不请求 API；刷新、打开或离开参数与标定页不会打开串口或发送目标。使用与验收见 [维护后端](../docs/MAINTENANCE_BACKEND.md)。

实际 USB 台架使用 `python scripts/hatchery-maintenance.py --list-ports` 枚举，再以显式 `--port` / `--baud` 启动，`--ids` 是可选初始轮询名单；例如本机 `--port COM5 --ids 1 --baud 1000000`。先在 FD1985 中关闭串口并给舵机供电。参数与标定页与连接说明提供具体步骤，默认只 PING；未分配关节的 ID 独立展示，不改 15 关节、草稿或索引。2026-10-10 已取得单颗 ID 1 的真实 PING，应答不等于位置或角度已接通；macOS / Linux 硬件仍未验收。构建文件位于 `src/`，顶层 `web/` 继续仅为前端。

联调采用左侧只读 3D、右侧纵向长滑块。右侧依次为左腿、右腿、头颈与嘴部三组，各五行，共 15 个关节；每行保留目标滑块、数字步进，下方紧凑展示实测/目标回读 ticks、raw load、V、°C、有效性与逐项结果，完整原因可展开。顶部集中范围、样例应用、反馈填入与禁用的实机使能入口；联调不设内部列表滚动，页面自然滚动。

2026-10-09 的 [工作区排版](docs/LOCAL_REVIEW_PROPOSAL.md#11-调试台反馈与关节工作台已实现本地样例) 保留原背景、配色和字体；设备信息、状态提示、导航、普通标题与工具栏使用常规尺寸和留白，紧凑处理集中在舵机行与反馈表数据行。单舵机页上方是 15 关节反馈表，下方左侧为大曲线、右侧为关节工作台；窄屏依次堆叠。反馈表采用单行关节标识与对齐数值，默认显示 13 列，可按左腿/右腿/头颈与嘴筛选、搜索名称或 ID、切换校准与使能列、导出当前筛选的带来源 CSV；表头固定、表体独立滚动。选择关节同步工作台与单关节曲线，不改草稿应用范围。联调下方也提供该反馈表；未知实际角度、零位、限位与使能均显示“—”。联调目标控件与反馈保持紧凑两行，正文 14px，15 关节全部展开，异常原因允许展开增高。

3D 可切换“目标草稿 / 样例反馈”，支持拖动旋转、缩放、复位视角和点击关节选中高亮。缺测关节显示灰色透明中性参考姿态，并列出缺测数量与原因；参考姿态不算实测。ticks 只按独立 UI 样例映射为普通关节 ±45°、嘴部 ±20°，没有真实校准。模型外形与嘴部估计铰链尚未匹配本机 Radxa / FT 装配。

反馈表默认保留原 ticks 样例；勾选“HD counts 参考样例”后只在表内查看独立的假数据和编码器参考 / 中位参考 / 目标参考角，新增三列后默认共 16 列。规格比例为 360/4096 °/count，2048 为编码器中位；实际关节角、校准与使能仍显示未知。该选择不改共享曲线、联调目标或 3D。CSV 保留旧 `*_ticks` 列名以兼容已有读取者，新增 `raw_unit`、profile 和原值 / 参考角 / 来源列；读取时须按 `raw_unit` 区分 counts 与 ticks，不能凭旧列名推断单位。

`#console/sensors` 已提供 IMU、ToF 与摄像头观察页，沿用原配色。IMU 可切换 Gravity / Gyro XYZ 并展开四元数；ToF 支持分区点选、mm / cm 显示和有效距离汇总，缺测保留“—”。两者目前使用明确标注的浏览器样例，暂停只冻结显示。摄像头通过当前媒体服务的 WebRTC 信令与视频轨道直播，来源、采集配置分别显示；默认不连接，离页清理信令与视频轨道。快照从当前视频导出，不再循环读取 PNG。页面没有轨迹或系统指标；相机参数通过媒体后端实时修改。真实传感器接入和板端画面待硬件验收。

当前总控和日志仍为独立占位页；“连接说明”按钮仅打开说明弹窗，顶部样例状态栏不构成整机总控页。总控内容见 [审查方案第 8 节](docs/LOCAL_REVIEW_PROPOSAL.md#8-总控界面方案待审查)。

独立曲线页可选择关节与数据，图表选择独立于草稿应用范围；位置、误差、raw load、电压和温度按单位分图。默认收起的曲线设置显示选择摘要；导航可收起。调试台会话统一采集浏览器样例，切换联调、单舵机与曲线只卸载视图，离开调试台才停止采集；暂停只冻结绘图。仅左膝有连续样例，其他关节与 raw load 保留缺测；目标草稿不替代目标回读，页面未连接设备。使用与暂停边界见 [联调说明](docs/JOINT_COORDINATION.md)。

修改拆分源码后，用 `python web/tools/build_standalone.py` 同步两份单文件入口；生成物内嵌 3D 引擎与模型，可直接以 `file://` 打开，无需 CDN。拆分入口按需加载本地 `vendor/three-0.160.0.min.js`、`model.json` 和 `meshes.bin`。

草稿、型号规格、参数页、反馈、曲线、会话、路由、3D 映射与网格解析使用 Node 原生测试：`node --test web/tests/*.test.cjs`，无额外测试包。最新测试和浏览器显示 / 交互核验以 [状态报告](docs/LOCAL_STATUS.md) 的实际结果为准。

## 目录与文档

```text
web/
├─ README.md          模块入口与运行方法
├─ NEXT_STEPS.md      官方 Web 参考、后续优先级与提交前事项
├─ docs/              状态、审查方案、视觉规范与源码参考
├─ prototype/         原型 HTML/CSS/JS、图片/字体、本地 3D 引擎与模型
├─ shell/             尚未完成的样例诊断页
├─ tools/             静态预览与单文件生成
├─ tests/             草稿、型号规格、参数页、反馈、曲线、会话、路由与 3D 的 Node 测试
├─ scripts/           设计包中的 Figma 脚本
├─ review/            来源作者的 Figma 截图
├─ licenses/          字体、图标、参考模型与 Three.js 的许可和署名
├─ tokens.json        视觉 token
└─ design-state.json  设计包生成元数据
```

详细分类见 [文档索引](docs/README.md)：

- [后续建议与提交前事项](NEXT_STEPS.md)。
- [当前状态与验证范围](docs/LOCAL_STATUS.md)。
- [总控、七章教程与关节联调审查稿](docs/LOCAL_REVIEW_PROPOSAL.md)。
- [FD1985 完整功能接入、双单位与批量标定方案](docs/FD1985_INTEGRATION_PROPOSAL.md)（B 已完成，C 只读软件基础可运行，硬件与完整功能待验收）。
- [视觉规范与素材署名](docs/Microduck-Hatchery-Visual-Design.md)。
- [冻结来源](docs/SOURCE_FREEZE.md)、[设备协议源码审核](docs/PROTOCOL_SOURCE_AUDIT.md)。

旧 Web 交接与执行计划已删除；全栈工作按 [根本地交接](../Microduck-Hatchery-Local-Development-Handoff.md)、[架构 v2](../docs/microduck-hatchery-architecture-v2.md) 和 [阶段计划](../docs/PLAN.md) 推进。项目记录在 [logs/PROJECT_LOG.md](../logs/PROJECT_LOG.md)。

## 前端边界

`web/` 管理页面、目标草稿、展示缓存与只读回放。正式控制关系为 Browser / Hatchery Web → 板端 Web / media gateway → shared protocol / RPC → robotd → duck-control / safety → motor bus；设备端裁定控制权、校准、限位、动作时序、确认与失联处置。

维护链路已接通 HTTP → 维护 RPC → robotd，串口边界在 duck-control。摄像头 / 舵机所需官方 daemon 和 IPC 已迁入，Radxa 构建、配置和启动见 [运行指南](../docs/RADXA_RUNTIME.md)；正式 Hatchery robot.* 订阅、装机运控和板端验收仍待完成。静态原型和 Python 样例工具不充当权威控制器，设备路径与能力按实物核对。

`prototype/camera.html/css/js` 是独立的板端只读快照页，由 mediad 提供，每秒请求 `/frame`；保持原浅色风格，不向总线发送控制。它不改变联调、曲线和 3D 的样例数据来源。

传感器页由 `sensor-data.js` 管理独立样例，`sensor-workspace.js/css` 管理 IMU / ToF 和紧凑相机排版，`sensor-camera.js` 管理当前媒体连接与快照生命周期，`camera-stream.js` 是官方客户端信令的仅视频适配。`camera-parameters.js` 独立管理能力校验、参数交互和同源维护接口；基础区为自动 / 手动曝光、曝光时间、模拟增益及亮度，高级参数折叠，采集帧率 / 分辨率 / 模式只读。实际控制由 mediad 执行并回读，缺测禁用，不自动重发；没有新增运行依赖。见 [相机参数](../docs/CAMERA_CONTROLS.md)。

高级设置包含锐度、Gamma 模式 / 系数、降噪 / 时域降噪和白平衡色温；设备未提供时明确禁用。Gamma 和白平衡增益显示小数，协议保留整数精度。ISP21 的 API2 扩展位于原 3A 服务进程，手动试运行时替代原实例，不增加服务；板端启动顺序与恢复步骤见上述文档。

模块职责保持分开：`joint-drafts.js` 管理映射、草稿、反馈与逐项结果；`joint-session.js` 管理样例来源、计时和有界缓存；`joint-console.js/css` 管理目标交互与工作台；`joint-feedback.js/css` 管理只读反馈表、筛选和快照；`single-joint-chart.js/css` 管理跟随当前关节的曲线，`joint-charts.js/css` 保留独立多关节绘图设置，两者只读共享历史；`joint-viewer-model.js` 负责独立显示映射，`joint-viewer-geometry.js` 校验/解码参考网格，`joint-viewer.js/css` 管理只读场景、相机与选中；`console-workspace.js/css` 管理子页、共享导航及显示/采集生命周期，`console-layout.css` 组织工作区排版；`app.js` 连接站点路由与页面事件。加载顺序见 [prototype/index.html](prototype/index.html)。

`device-session.js` 维持唯一同源只读设备会话；`device-telemetry.js` 负责缺测语义、连接状态、程序服务状态、地址筛选与最多 181 帧的单调时间历史；`device-overview.js` 负责设备卡片、仪表、趋势、连接切换与复制交互；`device-workspace.js` 负责共享设备栏、视图生命周期和本地显示偏好。图表复用 `joint-charts.js` 的断点路径函数，没有新增运行依赖。

`servo-profile.js` 是纯数据模块，管理版本化默认分辨率、显式单位校验、待核实参数目录和独立草稿 / JSON；`servo-parameters.js/css` 管理实际 ID 的参数 / 标定草稿、15 关节关联、批量快照和文件生命周期，未关联舵机共用这些逻辑。前端仅描述操作和原始回读范围，不裁定可写寄存器或持有串口、已生效实机校准，正式 profile 与角度由后端裁定。

`servo-backend.js` 独立校验和轮询维护原码快照，不渲染工作台；`servo-device.js/css` 管理参数与标定详情中的实际 ID、原值 / 12-bit 参考角、按 ID 草稿、扫描 / 取消和单次命令。未归类 ID 同样可调试，真实台架不要求先绑定 15 关节。GET 不写设备，显式 POST 由 robotd 串行执行；默认只读，台架动作需启动选项和裸机 / profile 确认。含期限、离页取消、去重与不自动重试；自身 ID 修改仅在实际固件匹配 FD 表、单颗确认、输出关闭且新 ID 未占用时执行；完整参数 / 批量硬件 / 固件尚未完成。见 [轻量工作台](../docs/MAINTENANCE_BACKEND.md#轻量台架工作台2026-10-11)。

保留全部 15 个物理关节和嘴部，显示顺序为左腿 → 右腿 → 头颈嘴，运行时与 14 维策略顺序独立。纸白、深绿黑、芥末黄、真实照片与技术文档方向保持。用户已批准本轮加入只读 3D，更新此前不加入 3D 的范围决定；展示不执行控制，不使用模型质量、IMU 或重心作稳定性判断，也不引入物理仿真或 RL 运行依赖。Web 仍不做策略导入、转换、推理，RL 属于整机和教程主线。

参考模型几何采用 CC BY-NC-SA 4.0，Three.js 采用 MIT；署名与适用范围见 [模型 NOTICE](licenses/microduck-model-NOTICE.md)。上游 `model.json` 的 Apache-2.0 字段与几何许可范围不一致，本项目以仓库明确的几何许可说明为准。

`connections-panel.js/css` 管理设备连接列表与显式操作，后端复用官方 configd；地址与 SSH 收在详情。启动与限制见 [设备连接](../docs/DEVICE_CONNECTIONS.md)。RKAIQ 通过既有服务开放实际支持的对比度、饱和度与自动 / 手动白平衡，不使用 CSS 模拟调色。
