# Microduck Hatchery Web

Hatchery 的开发、调试、展示和教程前端。当前是原生 HTML/CSS/JS 原型，数据为样例，实机控件禁用；截图式关节联调、只读 3D 姿态、单舵机调试和独立曲线页已实现，**总控界面（整机总览与全局操作）尚未实现**。总控和七章教程方案待审查，生产前端栈尚未冻结。

## 本地运行

在仓库根目录执行，无需安装第三方 Python 或 NPM 包；3D 引擎随仓库本地提供：

```powershell
python web/tools/preview.py
```

打开 <http://127.0.0.1:5173/>，用 `Ctrl+C` 停止；端口占用可加 `--port 5174`。脚本依据自身位置定位原型，仅提供 loopback 静态预览。

[单文件原型](Microduck-Hatchery-Visual-Prototype.html) 也可直接打开。已有 [Python 只读样例工具](../tools/hatchery-shell/README.md) 使用 `python scripts/hatchery-shell.py --port 8080`；诊断页 `shell/` 缺少 `app.js`，尚未完整可用。

打开 `#console` 或 `#console/servos` 默认进入联调。“舵机”下设同级子页：`#console/servos/joint` 关节联调、`#console/servos/single` 单舵机调试；曲线独立使用 `#console/charts`。2026-10-07 已按授权落实 [第 9 节布局](docs/LOCAL_REVIEW_PROPOSAL.md#9-舵机布局调整与独立曲线页已实现样例)，替代此前调节与曲线并排的布局。

最新 [第 10 节](docs/LOCAL_REVIEW_PROPOSAL.md#10-截图式联调布局与只读-3d已实现样例) 在原风格下采用左侧只读 3D、右侧纵向长滑块。右侧依次为左腿、右腿、头颈与嘴部三组，各五行，共 15 个关节；每行保留目标滑块、数字步进，下方紧凑展示实测/目标回读 ticks、raw load、V、°C、有效性与逐项结果，完整原因可展开。顶部集中范围、样例应用、反馈填入与禁用的实机使能入口；联调不设内部列表滚动，页面自然滚动。单舵机页保留独立滚动列表、详情与本地目标编辑。

3D 可切换“目标草稿 / 样例反馈”，支持拖动旋转、缩放、复位视角和点击关节选中高亮。缺测关节显示灰色透明中性参考姿态，并列出缺测数量与原因；参考姿态不算实测。ticks 只按独立 UI 样例映射为普通关节 ±45°、嘴部 ±20°，没有真实校准。模型外形与嘴部估计铰链尚未匹配本机 Radxa / FT 装配。

当前总控、设备、传感器和日志有独立路由及占位页，正式内容尚未实现；“连接说明”按钮仅打开说明弹窗，顶部样例状态栏不构成整机总控页。总控内容见 [审查方案第 8 节](docs/LOCAL_REVIEW_PROPOSAL.md#8-总控界面方案待审查)。

独立曲线页可选择关节与数据，图表选择独立于草稿应用范围；位置、误差、raw load、电压和温度按单位分图。默认收起的曲线设置显示选择摘要；导航可收起。调试台会话统一采集浏览器样例，切换联调、单舵机与曲线只卸载视图，离开调试台才停止采集；暂停只冻结绘图。仅左膝有连续样例，其他关节与 raw load 保留缺测；目标草稿不替代目标回读，页面未连接设备。使用与暂停边界见 [联调说明](docs/JOINT_COORDINATION.md)。

修改拆分源码后，用 `python web/tools/build_standalone.py` 同步两份单文件入口；生成物内嵌 3D 引擎与模型，可直接以 `file://` 打开，无需 CDN。拆分入口按需加载本地 `vendor/three-0.160.0.min.js`、`model.json` 和 `meshes.bin`。

受影响的草稿、曲线、会话、路由、3D 映射与网格解析使用 Node 原生测试：`node --test web/tests/joint-drafts.test.cjs web/tests/joint-charts.test.cjs web/tests/joint-session.test.cjs web/tests/console-routes.test.cjs web/tests/joint-viewer-model.test.cjs web/tests/joint-viewer-geometry.test.cjs`。本轮共 59 项通过，无额外测试包；浏览器显示与交互核验以 [状态报告](docs/LOCAL_STATUS.md) 的实际结果为准。

## 目录与文档

```text
web/
├─ README.md          模块入口与运行方法
├─ NEXT_STEPS.md      官方 Web 参考、后续优先级与提交前事项
├─ docs/              状态、审查方案、视觉规范与源码参考
├─ prototype/         原型 HTML/CSS/JS、图片/字体、本地 3D 引擎与模型
├─ shell/             尚未完成的样例诊断页
├─ tools/             静态预览与单文件生成
├─ tests/             草稿、曲线、会话、路由、3D 映射与网格的 Node 原生测试
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
- [视觉规范与素材署名](docs/Microduck-Hatchery-Visual-Design.md)。
- [冻结来源](docs/SOURCE_FREEZE.md)、[设备协议源码审核](docs/PROTOCOL_SOURCE_AUDIT.md)。

旧 Web 交接与执行计划已删除；全栈工作按 [根本地交接](../Microduck-Hatchery-Local-Development-Handoff.md)、[架构 v2](../docs/microduck-hatchery-architecture-v2.md) 和 [阶段计划](../docs/PLAN.md) 推进。项目记录在 [logs/PROJECT_LOG.md](../logs/PROJECT_LOG.md)。

## 前端边界

`web/` 管理页面、目标草稿、展示缓存与只读回放。正式控制关系为 Browser / Hatchery Web → 板端 Web / media gateway → shared protocol / RPC → robotd → duck-control / safety → motor bus；设备端裁定控制权、校准、限位、动作时序、确认与失联处置。

当前目录只预留了正式设备模块，尚未引入官方源码或连通上述链路。静态预览和 Python 样例工具都不充当权威控制器。实际平台为 Radxa Zero 3W / FT，设备路径与能力按配置核对。

模块职责保持分开：`joint-drafts.js` 管理映射、草稿、反馈与逐项结果；`joint-session.js` 管理样例来源、计时和有界缓存；`joint-console.js/css` 管理目标交互与舵机视图；`joint-charts.js/css` 只消费会话历史并绘图；`joint-viewer-model.js` 负责独立显示映射，`joint-viewer-geometry.js` 校验/解码参考网格，`joint-viewer.js/css` 管理只读场景、相机与选中；`console-workspace.js/css` 管理子页、共享导航及显示/采集生命周期；`app.js` 连接站点路由与页面事件。加载顺序见 [prototype/index.html](prototype/index.html)。

保留全部 15 个物理关节和嘴部，显示顺序为左腿 → 右腿 → 头颈嘴，运行时与 14 维策略顺序独立。纸白、深绿黑、芥末黄、真实照片与技术文档方向保持。用户已批准本轮加入只读 3D，更新此前不加入 3D 的范围决定；展示不执行控制，不使用模型质量、IMU 或重心作稳定性判断，也不引入物理仿真或 RL 运行依赖。Web 仍不做策略导入、转换、推理，RL 属于整机和教程主线。

参考模型几何采用 CC BY-NC-SA 4.0，Three.js 采用 MIT；署名与适用范围见 [模型 NOTICE](licenses/microduck-model-NOTICE.md)。上游 `model.json` 的 Apache-2.0 字段与几何许可范围不一致，本项目以仓库明确的几何许可说明为准。
