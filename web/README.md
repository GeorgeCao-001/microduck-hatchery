# Microduck Lab · Web

Microduck 复刻项目的 Web 工作区：展示实物与实验，整理制作教程，并为 Radxa Zero 3W 上的设备调试提供统一界面。

Web 是整个复刻项目的一部分。现阶段已确定初版视觉与交互原型，下一步逐步接入实际设备、补充教程和团队实验记录。

## 功能与页面

| 模块 | 内容 |
| --- | --- |
| 介绍 | 项目目标、实物照片、复刻路线和主要入口 |
| 实验展示 | 实机视频、实验条件、二维曲线和结果记录 |
| 教程 | 从硬件准备、装配到系统部署、连接和舵机调试；章节与本章目录放在同一栏，阅读标记随正文位置更新 |
| 调试台 | 设备状态、15 个关节、选中关节详情、目标/实际曲线及事件日志 |
| 记录 | 数据曲线、实验元信息、事件时间线和 CSV 导出 |

调试台的关节按 **左腿 → 右腿 → 头颈** 排列。左右腿均采用髋偏航、髋侧倾、髋俯仰、膝、踝的顺序，方便对称关节对照。关节列表独立滚动，桌面切换关节时保留列表位置与焦点，右侧详情同步更新；没有回读的关节仍保留，数值显示为 `—`。

## 当前状态

- 初版原型包含介绍、展示、教程、调试台、记录与连接说明，并提供桌面和手机布局。
- 调试台可预览示例、未连接、数据陈旧、只读四种状态。
- 设备值、曲线和日志目前为生成样例；控制按钮禁用，原型不会连接或操作设备。示例 CSV 带有 `sample=true` 标记。
- 教程目前包含六章路线、连接章草稿和其他章节提纲。后续逐章补充操作、预期现象、检查点与排错记录。
- 实机视频、团队照片、真实回读与 Windows / Linux / macOS 兼容性记录待补。交互逻辑已检查，完整浏览器验收与硬件验收仍待进行。

## 预览初版

取得当前设计包后，将其中的文件放入本目录；源码与设计文件会逐步入库。

**直接预览：** 用桌面浏览器打开 `Microduck-Lab-Visual-Prototype.html`。图片与拉丁/代码字体已内嵌，无需安装 Node.js 或启动开发板服务。

**查看分离源码：** 在本目录启动静态文件服务，再打开 <http://localhost:8080>。

```bash
# Linux / macOS
python3 -m http.server 8080 --directory prototype
```

```powershell
# Windows（已安装 Python）
py -m http.server 8080 --directory prototype
```

此服务仅用于预览静态原型。

## 源码与设计资料

设计包中的文件将按以下结构放入 `web/`：

| 路径 | 用途 |
| --- | --- |
| `README.md` | 本模块说明 |
| `Microduck-Lab-Visual-Prototype.html` | 可独立打开的单文件原型 |
| `prototype/` | 分离的 HTML、CSS、JavaScript、图片和字体 |
| `scripts/` | Figma 构建记录与待执行页面脚本 |
| `review/` | 已取得的设计截图 |
| `Microduck-Lab-Visual-Design.md` | 视觉规则、交互规格与验证记录 |
| `SOURCE_FREEZE.md` | 参考源码版本与接口边界 |
| `Microduck-Lab-Execution-Plan.md` | 实现顺序、任务进度与验收要求 |
| `Microduck-Lab-Handoff.md` | 项目续接说明 |
| `tokens.json`、`design-state.json` | 设计变量与当前状态 |
| `licenses/` | 随包素材的许可证 |

## 设备接入计划

设备端以 **Radxa Zero 3W** 为基线，电脑端面向 Windows、Linux 和 macOS。

| 路径 | 计划方式 |
| --- | --- |
| Wi-Fi | 电脑访问开发板提供的网页与 API |
| USB-C | USB-C 1 / OTG 配置虚拟网卡后，复用板端网页与 API；具体配置及主机枚举需实测 |
| BLE | 优先复用官方 `duckctl` / `btd`，由电脑本地桥接提供网页入口 |

介绍、教程、展示和记录阅读可在公开网站提供；设备调试进入开发板或本地桥接提供的同源网页。后续优先复用现有 `servo-web` 与飞特舵机工具，再补齐项目需要的设备身份、状态和操作回执。

## 后续工作

- [ ] 将原型源码和设计资料整理入库，确定正式工程结构。
- [ ] 接入设备发现、真实回读、关节映射和二维曲线。
- [ ] 在校准与限位核对后接入台架控制，记录实际操作结果。
- [ ] 逐章完善制作教程，补充团队实物、视频和复现记录。
- [ ] 完成浏览器、离线使用及三系统连接验收。

## 参考与设计来源

- [Pollen Robotics / Microduck](https://github.com/pollen-robotics/microduck)：官方项目与工具。
- [fanhao375 / microduck-replica](https://github.com/fanhao375/microduck-replica)：复刻方案、飞特版工具与参考照片。
- [Microduck Lab 设计稿](https://www.figma.com/design/1UFU4X1u0kT6j5DfzviosN)：品牌、组件与页面设计记录。

这是独立复刻项目的 Web 模块。复用的代码、照片、字体与图标保留各自来源和许可说明；团队实测结果会与参考素材、示例数据分别标注。
