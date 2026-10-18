# 安装生命周期 hooks

`preinstall.in` / `postinstall` 来自固定官方提交 `53230463927095ea890f231d29089bb0a538c06f`，保留安装前后职责和源码结构；不参与实时控制链。原始哈希与可执行模式见 [来源清单](../docs/UPSTREAM_IMPORT.json)。

当前仅迁入源文件，没有执行、安装、启用服务或应用设备配置。生成模板、FT 配置保留、资源与 CI 路径仍属 [M8](../docs/OFFICIAL_MIGRATION_EXECUTION.md)；不能直接用官方 provision / OTA 成品包替代 Hatchery 的 FT 运行时。Windows 工作区不声称已保存 POSIX 可执行位；正式发布包由打包器设置。
