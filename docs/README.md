# Microduck Hatchery 文档入口

目录结构以用户提供的 v2 为主要依据；当前是结构与样例工具整理，尚未引入官方运行源码或完成生产设备服务。`official-microduck/` 保存 Pollen Robotics 官方文档快照，**仅供借鉴，不能默认作为 Hatchery 的权威文档**。冲突以最新用户决定、本项目架构和实际硬件配置为准。

| 文档 | 职责 |
|---|---|
| [microduck-hatchery-architecture-v2.md](microduck-hatchery-architecture-v2.md) | 主要架构依据与完整 crate 映射 |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 当前结构、正式控制关系、样例隔离与硬件边界 |
| [PLAN.md](PLAN.md) | 必需主线、后续源码路径核对与验收条件 |
| [SOURCES.md](SOURCES.md) | 固定版本的官方来源、FT 对照与核对范围 |
| [官方 Microduck 文档参考](official-microduck/README.md) | 独立保存的官方 docs 快照，附来源、提交和校验清单；不覆盖本项目要求 |
| [设备模块](../src/README.md) | daemons / libraries；目前仅预留说明 |
| [共享协议](../protocol/README.md) | 正式协议模块位置与现有样例 JSON 的区别 |
| [本地样例工具](../tools/hatchery-shell/README.md) | 只读服务入口、检查与已知缺口 |
| [本地开发交接](../Microduck-Hatchery-Local-Development-Handoff.md) | 全栈接手要求与 15 关节映射 |
| [Web 文档索引](../web/docs/README.md) | Web 资料分类、有效文档与旧文档替代入口 |
| [Web 实际状态](../web/docs/LOCAL_STATUS.md) | 我们自己的验证、历史结果与未验收项 |
| [七章与联调审查稿](../web/docs/LOCAL_REVIEW_PROPOSAL.md) | 页面共同设计，实施前先审查 |
| [冻结设备协议审核](../web/docs/PROTOCOL_SOURCE_AUDIT.md) | 上游源码行为，不是实机验收 |
| [原始来源冻结](../web/docs/SOURCE_FREEZE.md) | 设计包来源与历史核对 |
| [视觉说明](../web/docs/Microduck-Hatchery-Visual-Design.md) | 视觉基础；章节和联调按最新决定 |
| [项目开发记录](../logs/PROJECT_LOG.md) | 已发生工作及验证范围 |

每个主题保持一份主文件，其他位置链接过去。冲突按最新用户决定、架构 v2 与交接要求处理；旧架构中的生产 Python API/controller 分层已由 v2 替代。历史日志保留当时方案，不作为现行架构。

`web/` 仅前端，正式设备权威在 robotd / duck-control；目录预留不代表 crate 已存在或可部署。教程保持七章和章内小节，不扩成大量平铺章节。开发过程记录在 `logs/`，设备输出与实验产物遵循 [日志管理说明](../logs/README.md)，区分来源作者结果和我们自己的验证。
