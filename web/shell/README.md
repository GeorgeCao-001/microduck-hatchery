# 工程壳诊断前端草稿

当前只有 `index.html` 与 `styles.css`，**缺少 `app.js`，页面连接、校验、陈旧状态与重连逻辑尚未实现**。以下是原草稿的目标行为，不是已完成结果。本轮未补写前端脚本。

本地 [只读样例工具](../../tools/hatchery-shell/README.md) 以同源 `/shell/` 提供该页面。工具位置是 `tools/hatchery-shell/`，不属于正式设备后端；已有视觉原型仍在 `web/prototype/`，七章和联调方案保持原入口。

## 目标行为

- 读取 `GET /api/v1/info`、`GET /api/v1/state` 和 `WS /api/v1/ws`，不提交目标、校准或策略请求。
- 检查完整 15 个关节和 mouth，再按显示索引展示；显示、运行时与策略索引独立，缺测显示 `—`。
- 仅识别明确的 `hatchery-shell/0` 样例标记：sample、fake、read-only、source=sample、无实机 device_id；不自动兼容真实设备协议。
- 保留 ticks、raw load、Unix 生成时间与后端会话单调经过时间，不把样例转换成真实角度、力矩或实测。
- 识别陈旧/断线，后台关闭样例流，重新读取时不补发历史请求；阈值不充当控制租约或设备断线保护。

正式控制权、校准、限位、真实状态与执行确认属于 robotd / duck-control，不属于浏览器或本样例工具。传输检查通过不等于该页完成，也不等于串口、WiFi 实机、USB、BLE、FT runtime、训练或三平台已验收。
