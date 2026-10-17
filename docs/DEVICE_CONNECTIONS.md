# 设备网络与蓝牙

设备页提供 Wi-Fi / 蓝牙开关、附近列表、连接 / 断开与忘记 / 移除；扫描与写入只由点击触发。IP、接口地址和 SSH 命令收在“关于这台设备 → 网络地址与 SSH”。仅支持当前设备，没有多设备入口。systemd 单元状态与独立运行的程序分别显示：单元 inactive 且程序 PID 存在时为“独立运行”。

## 官方实现与边界

`src/daemons/configd` 迁入 Pollen Robotics Microduck 的完整 configd，固定提交 `9136aa4ee88e81edf2bcaf3527e90b65da25f1eb`，Apache-2.0；文件清单见 [来源记录](UPSTREAM_IMPORT.json)。保留原模块、状态存储、凭据校验与 Net / Pads 接口。Wi-Fi 使用官方 NetworkManager D-Bus 后端，蓝牙使用官方 BlueZ 后端与设备范围的配对 agent，没有另写 nmcli / bluetoothctl 服务。原有 net.* / pad.* 协议继续兼容。

Hatchery 只增加 Web 所需的无线开关、断开、通用蓝牙列表与显式 MAC 操作。已保存 Wi-Fi 使用 NetworkManager ActivateConnection，既有密钥由 NetworkManager 持有，不读回网页；新密钥走官方连接流程。WPA3-only 按扫描结果选择 SAE。开放、WPA/WPA2 与 WPA3 网络可连接；802.1X 账号 / 证书配置、隐藏 SSID 暂不提供。开放校园网的网页登录仍由校园网认证系统完成。

蓝牙复用官方 NoInputNoOutput 配对流程，支持其允许的设备；需要输入 PIN、Passkey 或数值比较确认的设备尚不支持。配对和建立连接分别显示，不承诺音频播放、键盘输入等上层功能。后端缺失、权限不足、关闭无线或状态陈旧时禁用操作，不补模拟连接。

链路为浏览器 → mediad-maintenance 同源 gateway → configd Unix socket → NetworkManager / BlueZ。`GET /api/v1/maintenance/connections` 读取状态，`POST` 提交白名单 Action；保留 Host / Origin、cookie、JSON / 长度限制和 X-Hatchery-Command 验证。配置动作异步执行、有会话与请求去重，不因超时自动重发。密码只进入当前请求，不写浏览器存储、界面日志或返回状态；提交 / 关闭对话框后清空。

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

`src/daemons/configd/systemd/configd.service` 保留官方原文件，仍使用官方 `/opt/robot` 路径与 robot 组，**不能直接安装为本工作区服务**。本轮特权 systemd 适配被自动审批拒绝，使用以上可查看、可停止的前台启动方式；尚未完成持久部署。

本地验证覆盖源码、ARM64 类型检查、HTTP 边界与浏览器模拟交互，未操作板端无线网络或配对设备。Radxa 实际连接、重启重连和无线中断后的恢复由用户验证。
