# test-support

共享测试辅助代码的预留位置。未来随完整来源 crate 导入，不降低测试断言来适应目录变化。

当前未导入官方 test-support crate，无 Cargo manifest 或 binary。[maintenance_contract.py](maintenance_contract.py) 使用 Python 标准库启动实际 Rust binary，以明确 fixture 检查只读 RPC、gateway 会话 / 路径、15 关节映射及启动失败；不访问真实串口，不表示已有硬件验收。先构建 robotd / mediad，再在根目录执行 `python tools/test-support/maintenance_contract.py`。

Rust workspace 位于 `src/`，测试默认读取 `src/target/debug/`，自定义 `CARGO_TARGET_DIR` 的相对路径按 `src/` 解析；未分配 ID 的 fixture 另验证它不会替代关节或策略索引。
