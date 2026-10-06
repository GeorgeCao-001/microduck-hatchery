# 样例工具的只读会话

`ReadonlyController` 只管理开发样例工具的能力与会话。它委托 `SampleBackend` 读取固定夹具，生成会话 ID、帧序号和时间，明确禁止所有命令；它不是正式控制器或 robotd 的替代品。

`sampled_at_unix_s` 是生成样例帧时的 Unix 秒；`monotonic_elapsed_s` 是服务会话内的单调时长，`age_ms` 由单调钟计算。它们都不表示采集过机器人反馈。夹具的值保持固定，重连不会使其成为真实状态。

此工具保持样例只读。真实总线所有权、校准、限位、命令期限、逐关节确认和断线规则由后续板端 `robotd` 与 `duck-control/safety` 实现和验证；不能由本工具、前端或 API 合成成功。

