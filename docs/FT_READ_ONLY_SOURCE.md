# FT 只读边界来源审核

2026-10-11 补充：以下为原只读移植的来源记录。当前 bus 另扩展有界 READ 和 FD1985 HLSXX 参考 SRAM 白名单：输出 40、加速度 41、位置 42、速度 46。依据是本地 `tools/FD1985-250729/ft_setup_bat/setup.log`，未将 HLS 地址 44 的目标扭矩当作其他系列的时间字段。命令仅在显式台架模式开放；参考表尚不是实机核实的 HD 固件 profile，新增单颗 ID / 锁位事务：仅在实际身份匹配 FD HLS 3.40–3.59、输出关闭、新 ID 未占用且操作者确认只接一颗时开放地址 5 / 55；不提供通用 EEPROM、模式、偏移或固件写入。包和原参考解码继续复用冻结 FT 边界，依赖未增加，详见 [维护后端](MAINTENANCE_BACKEND.md)。

2026-10-10 的维护适配保留在 bus_maintenance.rs / io_maintenance.rs，默认 bus / io 重导出这些接口。2026-10-11 已另行迁入官方 daemon，并复用 FT 分支和 kissqy 固件的整机只读通信；它与本文维护协议分开，见 [Radxa 指南](RADXA_RUNTIME.md) 和 [导入清单](UPSTREAM_IMPORT.json)。两者不能同时占总线，没有新建 drivers framework。

| 项目 | 固定证据 |
|---|---|
| 原实现 | [fanhao375/microduck-replica · tools/servo-web/feetech.py](https://github.com/fanhao375/microduck-replica/blob/b5381d86b68d2e4f4606170d54d1f3f46d249ffc/tools/servo-web/feetech.py) |
| 提交 | `b5381d86b68d2e4f4606170d54d1f3f46d249ffc` |
| Git blob | `f89eee17613b2449293d0c4816db127c97b08d56` |
| 原文件 SHA256 | `3da2ac0eae837bcea8685297474c3bbb9c1c07eb5b1cdb2baebc0c2314115084` |
| 源码范围许可 | 来源根 LICENSE 的 tools 范围为 Apache-2.0；[保留许可](../src/libraries/duck-control/LICENSE-FT)、[署名与修改说明](../src/libraries/duck-control/NOTICE-FT.md) |

现有冻结 FT 实现使用 Python / pyserial。为了按 v2 让串口权威保留在 Rust `robotd → duck-control`，只将包格式、校验与参考反馈解码适配到 `bus.rs` / `io.rs`；没有另外运行 Python 串口进程，也没有无理由重写完整 FT 功能。

保留 `FF FF / ID / length / opcode / params / checksum`、PING、地址 56 / 15 字节 READ、小端字段与原码符号规则（position / speed / current 的 sign15，load 的 sign10）。新增读操作白名单、响应 ID / 长度 / 校验检查、有限等待、OS 串口独占、失败缺测和断开后显式重启。WRITE、SYNC_WRITE、REG_WRITE、ACTION、校准、恢复及固件指令未移植。

来源的 STS / SMS 描述、作者 HD 固件经验及默认系数不等于 Hatchery 的 HD 专用协议已确认。原始反馈字节始终保留；电流 ×6.5 mA、V /10 等系数当前没有应用。UI 不从这些参考解码产生真实关节角或标定状态。完整路线见 [接入方案](../web/docs/FD1985_INTEGRATION_PROPOSAL.md) 与 [维护后端](MAINTENANCE_BACKEND.md)。

本轮锁定直接依赖：serde 1.0.229、serde_json 1.0.151、serialport 4.10.1（关闭默认 libudev）、tiny_http 0.12.0；完整解析版本在 `src/Cargo.lock`。serialport 是 MPL-2.0，其他三个直接库为 MIT / Apache-2.0 双许可；其范围不替代 FT 来源或本项目资产许可。资料依据：[serialport](https://docs.rs/crate/serialport/4.10.1)、[serde](https://docs.rs/crate/serde/1.0.229)、[serde_json](https://docs.rs/crate/serde_json/1.0.151)、[tiny_http](https://docs.rs/crate/tiny_http/0.12.0)。
