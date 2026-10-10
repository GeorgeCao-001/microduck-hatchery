# Microduck Hatchery Web

Hatchery 的开发、调试、展示和教程前端。当前是原生 HTML/CSS/JS 原型，数据为样例，实机控件禁用；关节联调、只读 3D 姿态、全量反馈表、单舵机曲线与工作台、独立多关节曲线页已实现，**总控界面（整机总览与全局操作）尚未实现**。总控和七章教程方案待审查，生产前端栈尚未冻结。

2026-10-10 已批准 [FD1985 分阶段接入方案](docs/FD1985_INTEGRATION_PROPOSAL.md)：15 颗 HD-1910-C001。Radxa Zero 3W 是整机主要平台，Windows / macOS 本机台架是辅助入口。B 已加入参考角、参数 / 标定草稿与批量；C 已提供独立 Rust 后端只读快照，未接实际串口或完成标定，完整 FD 功能仍分阶段验收。

## 本地运行

在仓库根目录执行，无需安装第三方 Python 或 NPM 包；3D 引擎随仓库本地提供：

```powershell
python web/tools/preview.py
```

打开 <http://127.0.0.1:5173/>，用 `Ctrl+C` 停止；端口占用可加 `--port 5174`。脚本依据自身位置定位原型，仅提供 loopback 静态预览。

[单文件原型](Microduck-Hatchery-Visual-Prototype.html) 也可直接打开。已有 [Python 只读样例工具](../tools/hatchery-shell/README.md) 使用 `python scripts/hatchery-shell.py --port 8080`；诊断页 `shell/` 缺少 `app.js`，尚未完整可用。

打开 `#console` 或 `#console/servos` 默认进入联调。“舵机”下设同级子页：`#console/servos/joint` 关节联调、`#console/servos/single` 单舵机调试；曲线独立使用 `#console/charts`。2026-10-07 已按授权落实 [第 9 节布局](docs/LOCAL_REVIEW_PROPOSAL.md#9-舵机布局调整与独立曲线页已实现样例)，替代此前调节与曲线并排的布局。

新增 `#console/servos/parameters` 参数与标定，支持 15 关节紧凑表、独立批量范围、勾选字段、先预览差异再应用本地草稿，以及校验后的 JSON 导入导出。软件标定填写参考 counts / 参考姿态角 / 方向 / 机械限位，手动预览公式；完整草稿不自动生效，实机标定仍为 0/15。离页、换关节或修改草稿后需重新预览批量差异；整页刷新清空内存草稿，可先导出保存。维护页增加独立只读快照，维护操作仍禁用。详见 [使用说明](docs/JOINT_COORDINATION.md#参数与软件标定草稿)。

本机 Rust 后端使用 `python scripts/hatchery-maintenance.py --fixture`，需 Rust 1.99.0 与系统链接环境。打开 <http://127.0.0.1:8088/#console/servos/maintenance> 可查看明确 fake 的原码夹具、逐 ID 主机接收时间与串口枚举；不加 `--fixture` 保持未连接。原联调、曲线和 3D 仍为浏览器样例。静态预览 / 单文件不请求 API；刷新、打开或离开维护页不会打开串口或发送目标。使用与验收见 [维护后端](../docs/MAINTENANCE_BACKEND.md)。

实际 USB 台架使用 `python scripts/hatchery-maintenance.py --list-ports` 枚举，再以显式 `--port` / `--ids` / `--baud` 启动；例如本机 `--port COM5 --ids 1 --baud 1000000`。先在 FD1985 中关闭串口并给舵机供电。维护页与连接说明提供具体步骤，默认只 PING；未分配关节的 ID 独立展示，不改 15 关节、草稿或索引。2026-10-10 已取得单颗 ID 1 的真实 PING，应答不等于位置或角度已接通；macOS / Linux 硬件仍未验收。构建文件位于 `src/`，顶层 `web/` 继续仅为前端。

联调采用左侧只读 3D、右侧纵向长滑块。右侧依次为左腿、右腿、头颈与嘴部三组，各五行，共 15 个关节；每行保留目标滑块、数字步进，下方紧凑展示实测/目标回读 ticks、raw load、V、°C、有效性与逐项结果，完整原因可展开。顶部集中范围、样例应用、反馈填入与禁用的实机使能入口；联调不设内部列表滚动，页面自然滚动。

2026-10-09 的 [工作区排版](docs/LOCAL_REVIEW_PROPOSAL.md#11-调试台反馈与关节工作台已实现本地样例) 保留原背景、配色和字体；设备信息、状态提示、导航、普通标题与工具栏使用常规尺寸和留白，紧凑处理集中在舵机行与反馈表数据行。单舵机页上方是 15 关节反馈表，下方左侧为大曲线、右侧为关节工作台；窄屏依次堆叠。反馈表采用单行关节标识与对齐数值，默认显示 13 列，可按左腿/右腿/头颈与嘴筛选、搜索名称或 ID、切换校准与使能列、导出当前筛选的带来源 CSV；表头固定、表体独立滚动。选择关节同步工作台与单关节曲线，不改草稿应用范围。联调下方也提供该反馈表；未知实际角度、零位、限位与使能均显示“—”。联调目标控件与反馈保持紧凑两行，正文 14px，15 关节全部展开，异常原因允许展开增高。

3D 可切换“目标草稿 / 样例反馈”，支持拖动旋转、缩放、复位视角和点击关节选中高亮。缺测关节显示灰色透明中性参考姿态，并列出缺测数量与原因；参考姿态不算实测。ticks 只按独立 UI 样例映射为普通关节 ±45°、嘴部 ±20°，没有真实校准。模型外形与嘴部估计铰链尚未匹配本机 Radxa / FT 装配。

反馈表默认保留原 ticks 样例；勾选“HD counts 参考样例”后只在表内查看独立的假数据和编码器参考 / 中位参考 / 目标参考角，新增三列后默认共 16 列。规格比例为 360/4096 °/count，2048 为编码器中位；实际关节角、校准与使能仍显示未知。该选择不改共享曲线、联调目标或 3D。CSV 保留旧 `*_ticks` 列名以兼容已有读取者，新增 `raw_unit`、profile 和原值 / 参考角 / 来源列；读取时须按 `raw_unit` 区分 counts 与 ticks，不能凭旧列名推断单位。

当前总控、设备、传感器和日志有独立路由及占位页，正式内容尚未实现；“连接说明”按钮仅打开说明弹窗，顶部样例状态栏不构成整机总控页。总控内容见 [审查方案第 8 节](docs/LOCAL_REVIEW_PROPOSAL.md#8-总控界面方案待审查)。

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

当前最小 Rust 只读维护链路已接通 HTTP → 维护 RPC → robotd，串口只读边界在 duck-control；完整官方源码、Radxa gateway 与实机通信未完成。静态预览和 Python 样例工具不充当权威控制器，设备路径与能力按实际 Radxa / FT 配置核对。

模块职责保持分开：`joint-drafts.js` 管理映射、草稿、反馈与逐项结果；`joint-session.js` 管理样例来源、计时和有界缓存；`joint-console.js/css` 管理目标交互与工作台；`joint-feedback.js/css` 管理只读反馈表、筛选和快照；`single-joint-chart.js/css` 管理跟随当前关节的曲线，`joint-charts.js/css` 保留独立多关节绘图设置，两者只读共享历史；`joint-viewer-model.js` 负责独立显示映射，`joint-viewer-geometry.js` 校验/解码参考网格，`joint-viewer.js/css` 管理只读场景、相机与选中；`console-workspace.js/css` 管理子页、共享导航及显示/采集生命周期，`console-layout.css` 组织工作区排版；`app.js` 连接站点路由与页面事件。加载顺序见 [prototype/index.html](prototype/index.html)。

`servo-profile.js` 是纯数据模块，管理版本化默认分辨率、显式单位校验、待核实参数目录和独立草稿 / JSON；`servo-parameters.js/css` 管理参数与软件标定视图、批量快照和文件生命周期。前端不持有 FT 寄存器地址、串口或已生效实机校准，正式 profile 与角度由后端裁定。

`servo-backend.js/css` 独立校验并展示最小维护 RPC 的原码快照；请求仅 GET，含超时、离页取消与旧快照清理，不与样例采集、目标草稿或角度换算共用数据入口。

保留全部 15 个物理关节和嘴部，显示顺序为左腿 → 右腿 → 头颈嘴，运行时与 14 维策略顺序独立。纸白、深绿黑、芥末黄、真实照片与技术文档方向保持。用户已批准本轮加入只读 3D，更新此前不加入 3D 的范围决定；展示不执行控制，不使用模型质量、IMU 或重心作稳定性判断，也不引入物理仿真或 RL 运行依赖。Web 仍不做策略导入、转换、推理，RL 属于整机和教程主线。

参考模型几何采用 CC BY-NC-SA 4.0，Three.js 采用 MIT；署名与适用范围见 [模型 NOTICE](licenses/microduck-model-NOTICE.md)。上游 `model.json` 的 Apache-2.0 字段与几何许可范围不一致，本项目以仓库明确的几何许可说明为准。
