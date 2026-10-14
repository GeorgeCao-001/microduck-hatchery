# test-support

已迁入官方共享测试辅助 crate，作为 robotd 的 dev-dependency；保留断言与 examples，不部署到机器人。来源见 [导入清单](../../docs/UPSTREAM_IMPORT.json)，本轮未执行测试。

[maintenance_contract.py](maintenance_contract.py) 使用标准库启动实际维护 binary，以明确 fixture 检查只读 RPC、会话 / 路径、15 关节和启动失败；不访问实机。已同步到 robotd-maintenance / mediad-maintenance 名称，本轮未执行；后续由操作者先构建维护入口，再按需要运行。官方 OTA-dependent 集成测试不在本次 workspace 范围。

Rust workspace 位于 `src/`，测试默认读取 `src/target/debug/`，自定义 `CARGO_TARGET_DIR` 的相对路径按 `src/` 解析；未分配 ID 的 fixture 另验证它不会替代关节或策略索引。
