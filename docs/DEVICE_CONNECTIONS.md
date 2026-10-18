# 设备连接、名称与诊断

设备页提供 Wi-Fi / 蓝牙开关、附近列表、连接 / 断开与忘记 / 移除；扫描与写入只由点击触发。IP、接口地址和 SSH 命令收在“关于这台设备 → 网络地址与 SSH”。仅支持当前设备，没有多设备入口。systemd 单元状态与独立运行的程序分别显示：单元 inactive 且程序 PID 存在时为“独立运行”。

## 官方实现与边界

`src/daemons/configd` 保留 Pollen Robotics Microduck 的完整 crate，本轮非舵机升级固定到 `53230463927095ea890f231d29089bb0a538c06f`，Apache-2.0；文件清单见 [来源记录](UPSTREAM_IMPORT.json)。保留原模块、状态存储、凭据校验与 Net / Pads 接口。Wi-Fi 使用官方 NetworkManager D-Bus 后端，蓝牙使用官方 BlueZ 后端与设备范围的配对 agent，没有另写 nmcli / bluetoothctl 服务。原有 net.* / pad.* 协议继续兼容。

Hatchery 只增加 Web 所需的无线开关、断开、通用蓝牙列表与显式 MAC 操作。已保存 Wi-Fi 使用 NetworkManager ActivateConnection，既有密钥由 NetworkManager 持有，不读回网页；新密钥走官方连接流程。WPA3-only 按扫描结果选择 SAE。开放、WPA/WPA2 与 WPA3 网络可连接；802.1X 账号 / 证书配置、隐藏 SSID 暂不提供。开放校园网的网页登录仍由校园网认证系统完成。

蓝牙复用官方 NoInputNoOutput 配对流程，支持其允许的设备；需要输入 PIN、Passkey 或数值比较确认的设备尚不支持。配对和建立连接分别显示，不承诺音频播放、键盘输入等上层功能。后端缺失、权限不足、关闭无线或状态陈旧时禁用操作，不补模拟连接。

链路为浏览器 → mediad-maintenance 同源 gateway → configd Unix socket → NetworkManager / BlueZ。`GET /api/v1/maintenance/connections` 读取状态，`POST` 提交白名单 Action；保留 Host / Origin、cookie、JSON / 长度限制和 X-Hatchery-Command 验证。配置动作异步执行、有会话与请求去重，不因超时自动重发。密码只进入当前请求，不写浏览器存储、界面日志或返回状态；提交 / 关闭对话框后清空。

## 名称、程序版本与服务日志

“设备设置 → 设备名称 → 保存到设备”调用官方 `system.set_name`，由 configd 的 Store 写入自己的配置；保留其 24 字符命名规则，显示后端实际返回的名称。这是设备公告名称，与 Linux 主机名分开。“网页别名”、连接备注和复制 SSH 所用用户名仍仅存于本浏览器。名称写入只由点击触发，不自动重试；超时后须刷新核对，不把本地输入当作保存成功。

程序服务卡继续区分 systemd 与独立进程。“查看服务详情”补充官方 `system.services` 返回的实际程序版本、源码版本与路径；缺失时保持未知，不从已安装目录推测运行版本。“服务日志”默认折叠，选择程序后点击读取本次开机最近 100 条，不进行后台日志轮询。日志只读、按纯文本显示；常见密码、PSK、令牌和 PIN 字段所在行在 gateway 隐去。重启标记计入上限，保留最新内容。

| HTTP 接口 | 官方 configd 方法 | 限制 |
|---|---|---|
| `GET /api/v1/maintenance/system` | `system.info`、`system.services` | 共享轮询约 4 秒；超过 9 秒不再标为实时 |
| `POST /api/v1/maintenance/system/name` | `system.set_name` | 仅 `{ "name": "…" }`；保留同源、cookie 与命令头验证；权限仍由 configd 裁决 |
| `GET /api/v1/maintenance/system/logs/<程序>` | `system.logs` | 固定 9 个 daemon，加 bluetooth / NetworkManager；当前开机、100 条；不接收 shell 或 journalctl 参数 |

静态 / 单文件入口没有后端引导标记时不请求这些接口。后端不存在、权限不足、回复失效或离页时停止使用旧实时状态，名称保存禁用；日志的迟到回复不能覆盖后来选择的服务。此适配不增加 daemon、不调用 shell、不改服务启动或 OTA。

## 总控的正式只读状态

总控复用官方 `hello`、`robot.subscribe` 和 `robot.health`，通过 `GET /api/v1/maintenance/runtime` 读取网关共享缓存。正式 robotd 的 Unix socket 优先读取 `HATCHERY_ROBOT_SOCKET`，其次为 `DUCK_RUNTIME_DIR/robotd.sock`；默认与既有启动器一致：前台使用当前用户的 `~/.local/state/microduck-hatchery/run/robotd.sock`，systemd 使用 `/run/robot/robotd.sock`。该 GET 接口仍需要原同源会话 cookie，拒绝 POST，不开放任意 RPC。

整个网关只维持一个 5 Hz 上游状态订阅，健康检查约 2 秒一次；浏览器每 500 ms 读取最新缓存，跨页共享。帧过期、上游断线或重启后停止标为实时，离开调试台停止网页轮询；没有浏览器继续读取时上游订阅约 6—7 秒后关闭。设备单调时钟按字符串传递，未报告的角度 / 电压不填零。此协议未声明 fake / 实物模式，界面保留“后端未声明”。

需要正式 robotd 已在运行才有正式状态。维护端 `--fixture` 只产生维护样例，不能代替正式 robotd 流；其样例身份不被套用到总控。总控、关节反馈、曲线与 3D 共用这份正式状态。按 joint_names 语义对应 15 个关节，单位为后端 rad；不把设备 ID、显示顺序、策略索引或本地标定草稿作为位置数组索引。空数组、错单位、断线、重启与时钟回退清空旧反馈；逐关节电压 / 温度未提供时保留缺测。静态预览仍为样例。日志导航复用同一个限量日志读取器，点击读取才访问 configd。

## 在 Radxa 手动启动

先在仓库根目录构建。下面是用户在板上执行的步骤，本地开发没有安装或启用任何服务：

```bash
cd ~/microduck-hatchery/src
cargo build --locked --release -j 2 -p configd --features board-runtime --bin configd
cargo build --locked --release -j 2 --bin robotd-maintenance --bin mediad-maintenance
cd ..
```

板上必须已有 NetworkManager 和 BlueZ；只读检查：

```bash
systemctl is-active NetworkManager bluetooth
nmcli device status
```

在一个 Radxa SSH 终端运行官方 configd。root 用于系统 D-Bus 权限；仅把该前台进程的主组设为当前用户组，socket 为 0660，变更仍由 `--allow-user` 检查。没有修改系统组成员或持久服务单元：

```bash
export HATCHERY_CONFIG_SOCKET=/run/hatchery-configd.sock
sudo -g "$(id -gn)" ./src/target/release/configd   --socket "$HATCHERY_CONFIG_SOCKET" --allow-user "$USER"
```

另一个 Radxa 终端为维护 gateway 选择相同 socket，保留无舵机 fixture：

```bash
cd ~/microduck-hatchery
export HATCHERY_CONFIG_SOCKET=/run/hatchery-configd.sock
python3 scripts/hatchery-maintenance.py --release --no-build --fixture
```

浏览器打开维护入口的 `#console/device`，点击刷新列表后选择网络 / 蓝牙设备。切换承载网页 / SSH 的 Wi-Fi 可能中断当前连接，须通过 USB-C 或新网络恢复后核对实际状态；页面不把请求发出视为连接成功。

`src/daemons/configd/systemd/configd.service` 保留官方原文件，仍使用官方 `/opt/robot` 路径与 robot 组，**不能直接安装为本工作区服务**。用户于 2026-10-18 选择保留现有源码目录启动，暂缓安装 / OTA；继续使用以上可查看、可停止的前台方式，尚未完成持久部署。

本地验证覆盖源码、ARM64 类型检查、HTTP 边界与浏览器模拟交互，未操作板端无线网络或配对设备。Radxa 实际连接、重启重连和无线中断后的恢复由用户验证。

本批检查：136 项 Node、6 项 mediad-maintenance Rust、14 项实际 Windows gateway HTTP 合约、13 项 Edge 模拟交互通过；Windows 网关构建及 Linux ARM64 网关类型检查通过。Windows 没有 configd / systemd，HTTP 检查验证不可用与拒绝路径；浏览器命名和日志成功路径使用明确模拟传输。真实 Unix RPC、名称重启保留、板端服务版本与 journal 权限仍待用户验收。


## 手柄输入观察与视觉工具

设备页的“输入设备”通过固定 `GET /api/v1/maintenance/input` 读取官方 padd 的 `pad.input` / `pad.report`，显示内核报告的设备名称、USB / 蓝牙、摇杆范围与按键状态。仅有一个按需上游 tap；浏览器离页停止读取，网关约 6—7 秒无读者后释放 tap。断线、丢报告或序号重启会重新同步，过期值不再高亮按键。此接口拒绝 POST，不注入输入，也不宣称取得运动控制权。

默认 tap 为官方 `/run/padd/pad.sock`。自定义前台启动需让 padd 的 `--tap-socket` 与网关环境变量 `HATCHERY_PAD_SOCKET` 指向同一路径；不会由 robotd 的 socket 目录推测。这里不会自动启动、安装或启用 padd / netpadd。映射编辑与控制来源切换尚未接入，FT 控制逻辑保持原版。

传感器 → 相机 → 视觉工具提供原始视频、Canny 边缘、画面变化、稀疏光流和相机几何。前三个处理工具使用官方示例 `spaces/vision-demo/filters.py` 的 OpenCV 参数；固定本地 OpenCV.js 4.13.0 仅在用户选择滤镜时加载，运行时不访问 CDN。处理浏览器已收到的视频，最长边 640 px、最多 5 Hz，不改变板端采集帧率或再打开相机。暂停、断线与离页清除处理结果；相机几何只使用 `media.video` 发布的内参及 calibrated 标记，缺失不推算。file:// 单文件入口禁用此工具，保留静态预览。

本地验证使用模拟服务与合成视频，板端手柄、相机、权限和持续运行仍需用户验收。
