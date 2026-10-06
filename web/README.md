# Microduck Hatchery Web

Hatchery 的开发、调试、展示和教程前端。当前是原生 HTML/CSS/JS 原型，数据为样例，实机控件禁用；关节联调样例已实现，七章教程仍待方案审查，生产前端栈尚未冻结。

## 本地运行

在仓库根目录执行，无需安装第三方依赖：

```powershell
python web/tools/preview.py
```

打开 <http://127.0.0.1:5173/>，用 `Ctrl+C` 停止；端口占用可加 `--port 5174`。脚本依据自身位置定位原型，仅提供 loopback 静态预览。

[单文件原型](Microduck-Hatchery-Visual-Prototype.html) 也可直接打开。已有 [Python 只读样例工具](../tools/hatchery-shell/README.md) 使用 `python scripts/hatchery-shell.py --port 8080`；诊断页 `shell/` 缺少 `app.js`，尚未完整可用。

打开 `#console` 默认进入联调，可切换单关节调试。15 个关节在一个大面板内按左腿、右腿、头颈与嘴部分组三组，每组五张卡片；保留目标滑块、数字输入与步进，联调面板不设内部列表滚动。支持范围选择、反馈填充、姿态保存/加载和逐项样例检查，单关节列表继续独立滚动。

大曲线面板可选择关节与数据，图表选择独立于草稿应用范围；位置、误差、raw load、电压和温度按单位分图。默认收起的曲线设置显示选择摘要；导航可收起。当前仅左膝有浏览器生成的连续样例，其他关节与 raw load 保留缺测；目标草稿不替代目标回读，页面未连接设备。使用与暂停边界见 [联调说明](docs/JOINT_COORDINATION.md)。

修改拆分源码后，用 `python web/tools/build_standalone.py` 同步两份单文件入口；草稿与曲线模型用 `node --test web/tests/joint-drafts.test.cjs web/tests/joint-charts.test.cjs` 检查，无新增运行依赖。

## 目录与文档

```text
web/
├─ README.md          模块入口与运行方法
├─ NEXT_STEPS.md      官方 Web 参考、后续优先级与提交前事项
├─ docs/              状态、审查方案、视觉规范与源码参考
├─ prototype/         原型 HTML/CSS/JS、图片与字体
├─ shell/             尚未完成的样例诊断页
├─ tools/             静态预览与单文件生成
├─ tests/             草稿与曲线模型的 Node 原生测试
├─ scripts/           设计包中的 Figma 脚本
├─ review/            来源作者的 Figma 截图
├─ licenses/          字体与图标许可
├─ tokens.json        视觉 token
└─ design-state.json  设计包生成元数据
```

详细分类见 [文档索引](docs/README.md)：

- [后续建议与提交前事项](NEXT_STEPS.md)。
- [当前状态与验证范围](docs/LOCAL_STATUS.md)。
- [七章教程与关节联调审查稿](docs/LOCAL_REVIEW_PROPOSAL.md)。
- [视觉规范与素材署名](docs/Microduck-Hatchery-Visual-Design.md)。
- [冻结来源](docs/SOURCE_FREEZE.md)、[设备协议源码审核](docs/PROTOCOL_SOURCE_AUDIT.md)。

旧 Web 交接与执行计划已删除；全栈工作按 [根本地交接](../Microduck-Hatchery-Local-Development-Handoff.md)、[架构 v2](../docs/microduck-hatchery-architecture-v2.md) 和 [阶段计划](../docs/PLAN.md) 推进。项目记录在 [logs/PROJECT_LOG.md](../logs/PROJECT_LOG.md)。

## 前端边界

`web/` 管理页面、目标草稿、展示缓存与只读回放。正式控制关系为 Browser / Hatchery Web → 板端 Web / media gateway → shared protocol / RPC → robotd → duck-control / safety → motor bus；设备端裁定控制权、校准、限位、动作时序、确认与失联处置。

当前目录只预留了正式设备模块，尚未引入官方源码或连通上述链路。静态预览和 Python 样例工具都不充当权威控制器。实际平台为 Radxa Zero 3W / FT，设备路径与能力按配置核对。

保留全部 15 个物理关节和嘴部，显示顺序为左腿 → 右腿 → 头颈嘴，运行时与 14 维策略顺序独立。保留纸白、深绿黑、芥末黄、真实照片与技术文档方向；Web 不加入 3D、浏览器仿真或策略导入、转换、推理，RL 仍属于整机和教程主线。
